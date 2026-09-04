// WebSocket接続管理: 再接続(指数バックオフ)・ハートビート・429処理（基本設計/02_クライアント.md）
import {
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  PROTOCOL_VERSION,
  isPlayerIconId,
  type Level,
  type PlayerIconId,
  type ServerMessage,
} from "@beb/shared-core";
import { clearResult, setResult } from "./stores/result.svelte";
import { clearSecret, setSecret } from "./stores/secret.svelte";
import { clearServerState, setServerState } from "./stores/server-state.svelte";
import { ui } from "./stores/ui.svelte";

const HEARTBEAT_INTERVAL_MS = 25_000;
const NO_MESSAGE_TIMEOUT_MS = 60_000; // pongを含めこの間隔メッセージが無ければ自分から切断する
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 10_000]; // 上限10秒
// ブラウザのWebSocket APIはハンドシェイク失敗の実HTTPステータスを渡さないため、
// 「一度もopenしないまま閉じた」ことをもって429相当の可能性として扱い、最低30秒待つ
const CONNECT_FAILURE_BACKOFF_MS = 30_000;
// 再試行しても状況が変わらないエラー。受けたら再接続をやめ、画面に理由を出す（基本設計/02）
const FATAL_ERROR_CODES = new Set(["spectator_limit", "room_full", "game_in_progress"]);
// ハンドシェイクが一度も成立しない状態。部屋コードの誤り（404）と混雑（429）を
// ブラウザのWebSocket APIでは区別できないため、両方を含む文言で知らせる
export const CONNECT_FAILED = "connect_failed";

let socket: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let noMessageTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempt = 0;
let hasOpenedOnce = false;
let currentCode: string | null = null;
let pendingJoin: { name: string; level: Level; icon: PlayerIconId | undefined } | null = null;
// 接続直後に送るメッセージ。ホスト画面は参加者ではなく観戦ソケットとして入る（基本設計/02）
let entryMode: "join" | "spectate" = "join";
let closedByClient = false;

function sessionKey(code: string): string {
  return `beb-party:reconnectToken:${code}`;
}

function identityKey(code: string): string {
  return `beb-party:identity:${code}`;
}

/**
 * その部屋で名乗った名前とレベル。リロード・タブ復帰の復帰時に使う。
 *
 * これが無い状態で自動接続すると、URLやQRから直接開いた人が
 * 名前もレベルも申告しないまま参加者として登録される
 */
export function storedIdentity(code: string): { name: string; level: Level; icon: PlayerIconId | undefined } | null {
  const raw = sessionStorage.getItem(identityKey(code));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { name?: unknown; level?: unknown; icon?: unknown };
    if (typeof parsed.name !== "string" || typeof parsed.level !== "number") {
      return null;
    }
    // iconを持たない古いsessionStorageの値でも復帰できるようにする（サーバが既定値を割り当てる）
    const icon = isPlayerIconId(parsed.icon) ? parsed.icon : undefined;
    return { name: parsed.name, level: parsed.level as Level, icon };
  } catch {
    return null;
  }
}

function loadReconnectToken(code: string): string | undefined {
  return sessionStorage.getItem(sessionKey(code)) ?? undefined;
}

function saveReconnectToken(code: string, token: string): void {
  sessionStorage.setItem(sessionKey(code), token);
}

function wsUrl(code: string): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/room/${code}/ws`;
}

/** iconのundefinedは「アイコン未選択のsessionStorageからの復帰」のみ。サーバが既定値を割り当てる */
export function connect(code: string, name: string, level: Level, icon: PlayerIconId | undefined): void {
  currentCode = code;
  pendingJoin = { name, level, icon };
  sessionStorage.setItem(identityKey(code), JSON.stringify({ name, level, icon }));
  entryMode = "join";
  closedByClient = false;
  reconnectAttempt = 0;
  hasOpenedOnce = false;
  openSocket();
}

/**
 * 観戦ソケットとして接続する（ホスト画面）。
 *
 * `join` を送らないため部屋の参加者にならず、`secret` の配信対象にもならない（基本設計/01）。
 * 再接続の手順は参加者と同じで、`reconnectToken` は扱わない。
 */
export function spectate(code: string): void {
  currentCode = code;
  pendingJoin = null;
  entryMode = "spectate";
  closedByClient = false;
  reconnectAttempt = 0;
  hasOpenedOnce = false;
  openSocket();
}

export function disconnect(): void {
  closedByClient = true;
  clearTimers();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  socket?.close();
  socket = null;
  currentCode = null;
  pendingJoin = null;
  entryMode = "join";
  clearServerState();
  clearSecret();
  clearResult();
  ui.connectionStatus = "disconnected";
}

/**
 * ゲーム固有の操作を送る。送信できたかを返す。
 *
 * 呼び出し側は戻り値を見る。再接続中は送信されないため、送ったつもりで
 * 画面だけを操作済みにすると、サーバは締切までその人を待ち続ける。
 */
export function sendAction(action: string, payload: Record<string, unknown> = {}): boolean {
  return send({ v: PROTOCOL_VERSION, type: "action", action, ...payload });
}

export function sendCommon(
  message:
    | { type: "selectGame"; gameId: string }
    | { type: "configure"; contentId?: string; settings?: unknown }
    | { type: "start" }
    | { type: "nextGame" },
): void {
  send({ v: PROTOCOL_VERSION, ...message });
}

/** 送信できたかを返す。未接続のときは送らずfalseを返す */
function send(message: Record<string, unknown>): boolean {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function openSocket(): void {
  if (!currentCode) {
    return;
  }
  ui.connectionStatus = hasOpenedOnce ? "reconnecting" : "connecting";

  const instance = new WebSocket(wsUrl(currentCode));
  socket = instance;

  instance.addEventListener("open", () => {
    hasOpenedOnce = true;
    reconnectAttempt = 0;
    if (ui.lastErrorCode === CONNECT_FAILED) {
      ui.lastErrorCode = null;
    }
    ui.connectionStatus = "connected";
    sendEntry();
    startHeartbeat();
    resetNoMessageTimer();
  });

  instance.addEventListener("message", (event) => {
    resetNoMessageTimer();
    if (typeof event.data !== "string") {
      return;
    }
    if (event.data === HEARTBEAT_PONG) {
      return;
    }
    handleServerMessage(event.data);
  });

  instance.addEventListener("close", () => {
    stopHeartbeat();
    clearNoMessageTimer();
    if (closedByClient) {
      return;
    }
    if (!hasOpenedOnce) {
      // 一度もopenしていない = 部屋が存在しないか、レート制限に掛かっている。
      // 黙って30秒ごとに再試行し続けると、参加できていないことに気付けない
      ui.lastErrorCode = CONNECT_FAILED;
    }
    scheduleReconnect();
  });

  instance.addEventListener("error", () => {
    instance.close();
  });
}

function sendEntry(): void {
  if (!currentCode) {
    return;
  }
  if (entryMode === "spectate") {
    send({ v: PROTOCOL_VERSION, type: "spectate" });
    return;
  }
  if (!pendingJoin) {
    return;
  }
  const reconnectToken = loadReconnectToken(currentCode);
  send({
    v: PROTOCOL_VERSION,
    type: "join",
    name: pendingJoin.name,
    level: pendingJoin.level,
    ...(pendingJoin.icon ? { icon: pendingJoin.icon } : {}),
    ...(reconnectToken ? { reconnectToken } : {}),
  });
}

function handleServerMessage(raw: string): void {
  let message: ServerMessage;
  try {
    message = JSON.parse(raw) as ServerMessage;
  } catch {
    return;
  }

  switch (message.type) {
    case "joined": {
      if (currentCode) {
        saveReconnectToken(currentCode, message.reconnectToken);
      }
      ui.myPlayerId = message.playerId;
      break;
    }
    case "state": {
      const { v: _v, type: _type, serverNow, ...room } = message;
      setServerState(room, serverNow);
      // finished を抜けた時点で前ゲームの結果を捨てる。resultは切断時にしか消えないため、
      // nextGameで同じ部屋を続けると次のゲームの画面へ前回の結果が残る（実測）
      if (room.lifecycle !== "finished") {
        clearResult();
      }
      break;
    }
    case "secret": {
      setSecret(message.gameId, message.payload);
      break;
    }
    case "result": {
      setResult(message.gameId, message.payload);
      break;
    }
    case "error": {
      ui.lastErrorCode = message.code;
      if (FATAL_ERROR_CODES.has(message.code)) {
        // 再試行しても結果が変わらないエラー。バックオフで叩き続けると、
        // 同室の全員が同じIPを共有しているため再接続の予算まで食い潰す
        closedByClient = true;
        clearTimers();
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
        }
        socket?.close();
        ui.connectionStatus = "disconnected";
        break;
      }
      if (message.code === "unsupported_version") {
        // バックオフ再試行を続けると古いSPAのまま無限にエラーを受け続けるため、リロードで新しいSPAを取得する
        closedByClient = true;
        location.reload();
      }
      break;
    }
  }
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    // 固定文字列をそのまま送る。オブジェクトを組み立ててJSON.stringifyしない（基本設計/03_プロトコル.md）
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(HEARTBEAT_PING);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}

function resetNoMessageTimer(): void {
  clearNoMessageTimer();
  noMessageTimer = setTimeout(() => {
    // pongを含め60秒間何も受からなければ自分から接続を閉じ、再接続へ移る
    socket?.close();
  }, NO_MESSAGE_TIMEOUT_MS);
}

function clearNoMessageTimer(): void {
  if (noMessageTimer) {
    clearTimeout(noMessageTimer);
    noMessageTimer = undefined;
  }
}

function clearTimers(): void {
  stopHeartbeat();
  clearNoMessageTimer();
}

function scheduleReconnect(): void {
  ui.connectionStatus = "reconnecting";
  const delay = hasOpenedOnce
    ? (RECONNECT_BACKOFF_MS[Math.min(reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)] ?? CONNECT_FAILURE_BACKOFF_MS)
    : CONNECT_FAILURE_BACKOFF_MS;
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    openSocket();
  }, delay);
}

// タブ復帰時は即時に再接続を試みる（基本設計/02_クライアント.md）
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || closedByClient || !currentCode) {
      return;
    }
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      openSocket();
    }
  });
}
