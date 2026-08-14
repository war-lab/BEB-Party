// WebSocket接続管理: 再接続(指数バックオフ)・ハートビート・429処理（基本設計/02_クライアント.md）
import { HEARTBEAT_PING, HEARTBEAT_PONG, PROTOCOL_VERSION, type Level, type ServerMessage } from "@beb/shared-core";
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

let socket: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let noMessageTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempt = 0;
let hasOpenedOnce = false;
let currentCode: string | null = null;
let pendingJoin: { name: string; level: Level } | null = null;
let closedByClient = false;

function sessionKey(code: string): string {
  return `beb-party:reconnectToken:${code}`;
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

export function connect(code: string, name: string, level: Level): void {
  currentCode = code;
  pendingJoin = { name, level };
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
  clearServerState();
  clearSecret();
  clearResult();
  ui.connectionStatus = "disconnected";
}

export function sendAction(action: string, payload: Record<string, unknown> = {}): void {
  send({ v: PROTOCOL_VERSION, type: "action", action, ...payload });
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

function send(message: Record<string, unknown>): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
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
    ui.connectionStatus = "connected";
    sendJoin();
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
    scheduleReconnect();
  });

  instance.addEventListener("error", () => {
    instance.close();
  });
}

function sendJoin(): void {
  if (!pendingJoin || !currentCode) {
    return;
  }
  const reconnectToken = loadReconnectToken(currentCode);
  send({
    v: PROTOCOL_VERSION,
    type: "join",
    name: pendingJoin.name,
    level: pendingJoin.level,
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
