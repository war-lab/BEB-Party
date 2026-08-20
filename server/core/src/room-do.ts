import { DurableObject } from "cloudflare:workers";
import {
  ERROR_CODES,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  PROTOCOL_VERSION,
  fallbackPlayerIconId,
  parseClientMessage,
  type ActionMessage,
  type ConfigureMessage,
  type ErrorMessage,
  type GameTransition,
  type JoinMessage,
  type Player,
  type SelectGameMessage,
  type ServerMessage,
  type StateMessage,
} from "@beb/shared-core";
import { registry } from "./registry";
import {
  emptySecretsState,
  toPublicRoom,
  type AlarmsState,
  type InternalRoomState,
  type SecretsState,
} from "./state";
import { generatePlayerId, generateReconnectToken, generateSeed } from "./ids";

// ソケット⇔プレイヤーの対応。serializeAttachmentで保持し、インメモリのMapに依存しない（不変条件6）。
// connectedAtは、一度もハートビートを送っていない接続(getWebSocketAutoResponseTimestampがnull)を
// 死活判定するためのフォールバック起点として使う
type Attachment = { playerId: string; connectedAt: number } | { spectator: true; connectedAt: number };

const SPECTATOR_LIMIT = 2;

// ソケット1本あたりのメッセージ流量。通常のプレイは1分間に数回であり、
// 連打・自動化だけがこの値に届く（基本設計/01のレート制限）
const MESSAGE_RATE_WINDOW_MS = 10_000;
const MESSAGE_RATE_LIMIT = 20;

// 流量カウンタ。Hibernationで消えるが、消えても制限が緩む方向にしか働かず
// 部屋の状態には影響しない（ADR-0017）。storageに書くと「書き込みを抑える仕組みが
// 書き込みを増やす」ことになるため、あえてインメモリに置く
const messageRates = new WeakMap<WebSocket, { windowStart: number; count: number }>();

/** 直近の窓での流量が上限を超えたか。超えていればtrue */
function exceedsMessageRate(ws: WebSocket): boolean {
  const now = Date.now();
  const current = messageRates.get(ws);
  if (!current || now - current.windowStart >= MESSAGE_RATE_WINDOW_MS) {
    messageRates.set(ws, { windowStart: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MESSAGE_RATE_LIMIT;
}

// ゲーム未選択のロビーで使う人数上限。レジストリ内の最大値を上限とし、
// ゲームが決まったらそのゲームの上限に切り替える（基本設計/01）
function roomCapacity(gameId: string | undefined): number {
  const selected = gameId ? registry[gameId] : undefined;
  if (selected) {
    return selected.playerCount[1];
  }
  const all = Object.values(registry).map((module) => module.playerCount[1]);
  return all.length > 0 ? Math.max(...all) : 0;
}

// 90秒(ハートビート間隔25秒の3倍を超える値)より古い自動応答は切断済みとみなす（基本設計/01_サーバ.md、ADR-0013）
const HEARTBEAT_DEAD_THRESHOLD_MS = 90_000;
// 最終アクセスから2時間で部屋を破棄する（基本設計/01_サーバ.md）
const ROOM_EXPIRE_MS = 2 * 60 * 60 * 1000;

// RoomDO: 部屋 = 1インスタンス。ゲームのルールを判定せず、GameModuleが返すGameTransitionを
// 反映する係に徹する（ADR-0009、基本設計/01_サーバ.md）
export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // ハートビートの固定文字列はshared/coreの定数をそのまま使う（オブジェクトから組み立てない、ADR-0013）
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      return this.handleInit(request);
    }

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade();
    }

    return new Response("not found", { status: 404 });
  }

  private async handleInit(request: Request): Promise<Response> {
    const existing = await this.ctx.storage.get<InternalRoomState>("room");
    if (existing) {
      return Response.json({ error: "already_active" }, { status: 409 });
    }
    const body = (await request.json()) as { code: string };
    const room: InternalRoomState = { code: body.code, lifecycle: "lobby", players: [] };
    await this.ctx.storage.put("room", room);
    await this.ctx.storage.put("secrets", emptySecretsState());
    await this.updateAlarm(room);
    return Response.json({ code: body.code });
  }

  private async handleWebSocketUpgrade(): Promise<Response> {
    const room = await this.ctx.storage.get<InternalRoomState>("room");
    if (!room) {
      // 未初期化のコードへのアップグレードは確立前に拒否する（基本設計/01_サーバ.md）
      return Response.json({ error: ERROR_CODES.ROOM_NOT_FOUND }, { status: 404 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string): Promise<void> {
    // ハンドラ内の想定外の例外でソケットを落とさない。落とすとクライアントが再接続を繰り返し、
    // 同じ入力で同じ例外を踏み続ける（ゲームモジュールのstartが投げる例外など）
    // ハートビートは自動応答で返るためここへは来ない。到達するのはクライアントの明示的な操作だけである
    if (exceedsMessageRate(ws)) {
      this.sendError(ws, ERROR_CODES.RATE_LIMITED, "too many messages");
      return;
    }

    try {
      await this.handleMessage(ws, raw);
    } catch (error) {
      console.error("webSocketMessageで未捕捉の例外", error);
      this.sendError(ws, ERROR_CODES.INVALID_PAYLOAD, "internal error");
    }
  }

  private async handleMessage(ws: WebSocket, raw: ArrayBuffer | string): Promise<void> {
    // 別の理由でDOが起きたときにまとめて死活判定を行う（ADR-0013）
    await this.detectDeadSockets();

    if (typeof raw !== "string") {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const message = parseClientMessage(parsed);
    if (!message) {
      this.sendError(ws, ERROR_CODES.INVALID_PAYLOAD, "malformed message");
      return;
    }

    if (message.v !== PROTOCOL_VERSION && (message.type === "join" || message.type === "spectate")) {
      // 非対応バージョンのjoin/spectateを拒否する（基本設計/03_プロトコル.md）。
      // クライアントは再接続を続けずlocation.reload()する
      this.sendError(ws, ERROR_CODES.UNSUPPORTED_VERSION, "unsupported protocol version");
      return;
    }

    switch (message.type) {
      case "join":
        return this.handleJoin(ws, message);
      case "spectate":
        return this.handleSpectate(ws);
      case "selectGame":
        return this.handleSelectGame(ws, message);
      case "configure":
        return this.handleConfigure(ws, message);
      case "start":
        return this.handleStart(ws);
      case "action":
        return this.handleAction(ws, message);
      case "nextGame":
        return this.handleNextGame(ws);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const playerId = this.getAttachedPlayerId(ws);
    if (!playerId) {
      return;
    }
    // 再接続で新しいソケットに切り替わったあとに古いソケットのcloseが届くことがある。
    // そのまま処理すると復帰直後のプレイヤーをconnected: falseに戻し、ホスト権限まで移譲してしまう
    if (this.hasOtherSocket(ws, playerId)) {
      return;
    }
    const room = await this.getRoom();
    const player = room.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = false;
      this.reassignHostIfNeeded(room);
      await this.ctx.storage.put("room", room);
      await this.updateAlarm(room);
      this.broadcastState(room);
    }
  }

  async alarm(): Promise<void> {
    // 別の理由でDOが起きたときにまとめて死活判定を行う（ADR-0013）
    await this.detectDeadSockets();

    const alarms = await this.ctx.storage.get<AlarmsState>("alarms");
    if (!alarms) {
      return; // 部屋が既に破棄されている
    }

    const now = Date.now();
    if (now >= alarms.expireAt) {
      await this.destroyRoom();
      return;
    }

    if (alarms.stageDeadline !== undefined && now >= alarms.stageDeadline) {
      await this.dispatchDeadline();
    }
  }

  // --- メッセージハンドラ ---

  private async handleJoin(ws: WebSocket, message: JoinMessage): Promise<void> {
    // 1ソケット1席。身元が確定したソケットからの再申告を通すと、席だけが増えて
    // 対応するソケットを失う（幽霊席）。幽霊席は切断も死活判定も効かず、部屋が操作不能になる
    if (this.deserializeAttachment(ws) !== null) {
      return this.sendError(ws, ERROR_CODES.INVALID_LIFECYCLE, "already joined on this socket");
    }

    const room = await this.getRoom();
    const secrets = await this.getSecrets();

    if (message.reconnectToken) {
      const existingPlayerId = Object.entries(secrets.reconnectTokens).find(
        ([, token]) => token === message.reconnectToken,
      )?.[0];
      if (existingPlayerId) {
        const player = room.players.find((p) => p.id === existingPlayerId);
        if (player) {
          await this.reconnectPlayer(ws, room, secrets, player, message.reconnectToken);
          return;
        }
      }
      // 照合失敗。ゲーム中はgame_in_progress、ロビーなら新規参加として扱う（基本設計/01_サーバ.md）
      if (room.lifecycle !== "lobby") {
        this.sendError(ws, ERROR_CODES.GAME_IN_PROGRESS, "reconnect failed");
        return;
      }
    }

    if (room.lifecycle !== "lobby") {
      this.sendError(ws, ERROR_CODES.GAME_IN_PROGRESS, "room is not accepting new players");
      return;
    }

    if (room.players.length >= roomCapacity(room.gameId)) {
      return this.sendError(ws, ERROR_CODES.ROOM_FULL, "room is full");
    }

    const playerId = generatePlayerId();
    const reconnectToken = generateReconnectToken();
    const player: Player = {
      id: playerId,
      name: message.name,
      level: message.level,
      // 旧SPAはiconを送らない。全員が同じ見た目になるのを避けるため、playerIdから決まる値を割り当てる
      icon: message.icon ?? fallbackPlayerIconId(playerId),
      connected: true,
      isHost: room.players.length === 0,
    };
    room.players.push(player);
    secrets.reconnectTokens[playerId] = reconnectToken;
    this.reassignHostIfNeeded(room);

    await this.ctx.storage.put("room", room);
    await this.ctx.storage.put("secrets", secrets);
    await this.updateAlarm(room);

    ws.serializeAttachment({ playerId, connectedAt: Date.now() } satisfies Attachment);
    this.send(ws, { v: PROTOCOL_VERSION, type: "joined", playerId, reconnectToken });
    this.broadcastState(room);
  }

  private async reconnectPlayer(
    ws: WebSocket,
    room: InternalRoomState,
    secrets: SecretsState,
    player: Player,
    reconnectToken: string,
  ): Promise<void> {
    player.connected = true;
    this.reassignHostIfNeeded(room);
    await this.ctx.storage.put("room", room);
    await this.updateAlarm(room);

    ws.serializeAttachment({ playerId: player.id, connectedAt: Date.now() } satisfies Attachment);
    // 同じ席の古いソケットは閉じる。残すと死活判定（detectDeadSockets）が古い方の無応答を見て
    // 復帰済みのプレイヤーをconnected: falseにする
    this.closeSupersededSockets(ws, player.id);
    this.send(ws, { v: PROTOCOL_VERSION, type: "joined", playerId: player.id, reconnectToken });
    this.broadcastState(room);

    if (room.lifecycle === "playing" || room.lifecycle === "finished") {
      const payload = secrets.playerSecrets[player.id];
      if (payload !== undefined && room.gameId) {
        this.send(ws, { v: PROTOCOL_VERSION, type: "secret", gameId: room.gameId, payload });
      }
    }
    this.sendLastResult(ws, room, secrets);
  }

  private async handleSpectate(ws: WebSocket): Promise<void> {
    // 参加者のソケットを観戦へ転向させない。転向するとattachmentからplayerIdが消え、
    // その席は切断も死活判定も効かないまま connected: true で残る
    if (this.deserializeAttachment(ws) !== null) {
      return this.sendError(ws, ERROR_CODES.INVALID_LIFECYCLE, "already joined on this socket");
    }

    const spectatorCount = this.ctx.getWebSockets().filter((socket) => {
      const attachment = this.deserializeAttachment(socket);
      return attachment !== null && "spectator" in attachment;
    }).length;

    if (spectatorCount >= SPECTATOR_LIMIT) {
      this.sendError(ws, ERROR_CODES.SPECTATOR_LIMIT, "spectator limit reached");
      ws.close(1008, "spectator_limit");
      return;
    }

    ws.serializeAttachment({ spectator: true, connectedAt: Date.now() } satisfies Attachment);
    const room = await this.getRoom();
    this.send(ws, this.buildStateMessage(room));
    // 開示中に表示端末を切り替えた場合も、その回の開示を出せるようにする
    this.sendLastResult(ws, room, await this.getSecrets());
  }

  private async handleSelectGame(ws: WebSocket, message: SelectGameMessage): Promise<void> {
    const room = await this.getRoom();
    if (room.lifecycle !== "lobby") {
      return this.sendError(ws, ERROR_CODES.INVALID_LIFECYCLE, "not in lobby");
    }
    if (!this.isHost(ws, room)) {
      return this.sendError(ws, ERROR_CODES.NOT_HOST, "host only");
    }
    if (!registry[message.gameId]) {
      return this.sendError(ws, ERROR_CODES.UNKNOWN_GAME, "unknown gameId");
    }

    room.gameId = message.gameId;
    room.contentId = undefined;
    room.settings = undefined;
    await this.ctx.storage.put("room", room);
    await this.updateAlarm(room);
    this.broadcastState(room);
  }

  private async handleConfigure(ws: WebSocket, message: ConfigureMessage): Promise<void> {
    const room = await this.getRoom();
    if (room.lifecycle !== "lobby") {
      return this.sendError(ws, ERROR_CODES.INVALID_LIFECYCLE, "not in lobby");
    }
    if (!this.isHost(ws, room)) {
      return this.sendError(ws, ERROR_CODES.NOT_HOST, "host only");
    }
    const gameModule = room.gameId ? registry[room.gameId] : undefined;
    if (!gameModule) {
      return this.sendError(ws, ERROR_CODES.UNKNOWN_GAME, "no game selected");
    }
    const validation = gameModule.validateSettings(message.settings);
    if (!validation.valid) {
      return this.sendError(ws, ERROR_CODES.INVALID_PAYLOAD, validation.reason ?? "invalid settings");
    }
    // contentIdの範囲検証は共通コアの責務（基本設計/01のメッセージ処理表）。
    // 未登録のidを保存するとstartでゲームモジュールが引けず、例外になる
    if (message.contentId !== undefined && !gameModule.listContents().some((c) => c.id === message.contentId)) {
      return this.sendError(ws, ERROR_CODES.INVALID_PAYLOAD, "unknown contentId");
    }

    room.contentId = message.contentId;
    room.settings = message.settings;
    await this.ctx.storage.put("room", room);
    await this.updateAlarm(room);
    this.broadcastState(room);
  }

  private async handleStart(ws: WebSocket): Promise<void> {
    const room = await this.getRoom();
    if (room.lifecycle !== "lobby") {
      return this.sendError(ws, ERROR_CODES.INVALID_LIFECYCLE, "not in lobby");
    }
    if (!this.isHost(ws, room)) {
      return this.sendError(ws, ERROR_CODES.NOT_HOST, "host only");
    }
    const gameModule = room.gameId ? registry[room.gameId] : undefined;
    if (!gameModule) {
      return this.sendError(ws, ERROR_CODES.UNKNOWN_GAME, "no game selected");
    }
    const [min, max] = gameModule.playerCount;
    if (room.players.length < min || room.players.length > max) {
      return this.sendError(ws, ERROR_CODES.PLAYER_COUNT_MISMATCH, "player count out of range");
    }
    // コンテンツを持つゲームは、選択されていなければ開始できない。
    // コンテンツを持たないゲーム（listContentsが空）はこの検査の対象外とする
    const contents = gameModule.listContents();
    if (contents.length > 0 && !contents.some((c) => c.id === room.contentId)) {
      return this.sendError(ws, ERROR_CODES.INVALID_PAYLOAD, "content not selected");
    }

    const startResult = gameModule.start({
      players: room.players,
      contentId: room.contentId ?? "",
      settings: room.settings,
      seed: generateSeed(),
    });

    room.lifecycle = "playing";
    room.stage = startResult.stage;
    room.deadline = Date.now() + startResult.deadlineSeconds * 1000;
    room.gameState = startResult.publicState;

    const secrets = await this.getSecrets();
    for (const [playerId, payload] of startResult.secrets) {
      secrets.playerSecrets[playerId] = payload;
    }
    secrets.gameSecret = startResult.gameSecret;

    await this.ctx.storage.put("room", room);
    await this.ctx.storage.put("secrets", secrets);
    await this.updateAlarm(room);

    this.sendSecretsToConnectedPlayers(room, startResult.secrets);
    this.broadcastState(room);
  }

  private async handleAction(ws: WebSocket, message: ActionMessage): Promise<void> {
    const room = await this.getRoom();
    if (room.lifecycle !== "playing") {
      return this.sendError(ws, ERROR_CODES.INVALID_LIFECYCLE, "not playing");
    }
    const playerId = this.getAttachedPlayerId(ws);
    if (!playerId) {
      return this.sendError(ws, ERROR_CODES.INVALID_LIFECYCLE, "not a participant");
    }
    // room.gameIdはplaying中は必ず選択済み（startを経ないとplayingにならないため）
    const gameModule = room.gameId ? registry[room.gameId] : undefined;
    if (!gameModule) {
      return this.sendError(ws, ERROR_CODES.UNKNOWN_GAME, "no game selected");
    }

    const { v: _v, type: _type, action: _action, ...payload } = message;
    const transition = gameModule.handleAction({
      room: toPublicRoom(room),
      publicState: room.gameState,
      gameSecret: (await this.getSecrets()).gameSecret,
      playerId,
      action: message.action,
      payload,
    });

    if (transition.reject) {
      this.sendError(ws, transition.reject.code, "action rejected");
      return;
    }

    await this.applyTransition(room, transition);
  }

  private async handleNextGame(ws: WebSocket): Promise<void> {
    const room = await this.getRoom();
    if (room.lifecycle !== "finished") {
      return this.sendError(ws, ERROR_CODES.INVALID_LIFECYCLE, "not finished");
    }
    if (!this.isHost(ws, room)) {
      return this.sendError(ws, ERROR_CODES.NOT_HOST, "host only");
    }

    // ADR-0011: 持ち越すのは参加者とそのレベルだけ。gameId/contentId/settingsも含め選択は全てクリアする
    const nextRoom: InternalRoomState = {
      code: room.code,
      lifecycle: "lobby",
      players: room.players,
    };
    await this.ctx.storage.put("room", nextRoom);

    const secrets = await this.getSecrets();
    secrets.playerSecrets = {};
    secrets.gameSecret = undefined;
    await this.ctx.storage.put("secrets", secrets);
    await this.updateAlarm(nextRoom);

    this.broadcastState(nextRoom);
  }

  // --- 時間駆動処理（アラーム多重化・死活判定・部屋のGC。基本設計/01_サーバ.md、ADR-0013） ---

  private async dispatchDeadline(): Promise<void> {
    const room = await this.getRoom();
    if (room.lifecycle !== "playing" || !room.gameId) {
      // 締切に達したが既に状態が進んでいた（他経路で先に遷移した等）。何もしない
      await this.updateAlarm(room);
      return;
    }
    const gameModule = registry[room.gameId];
    if (!gameModule) {
      await this.updateAlarm(room);
      return;
    }
    const transition = gameModule.onDeadline({
      room: toPublicRoom(room),
      publicState: room.gameState,
      gameSecret: (await this.getSecrets()).gameSecret,
    });
    if (transition.reject) {
      // onDeadlineは強制遷移が前提であり、rejectは通常返らない。返った場合はアラームだけ再設定する
      await this.updateAlarm(room);
      return;
    }
    await this.applyTransition(room, transition);
  }

  private async destroyRoom(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      socket.close(1000, "room_expired");
    }
    await this.ctx.storage.deleteAll();
  }

  // ハートビートの最終自動応答時刻が90秒より古いソケットをconnected: falseにする（ADR-0013）
  private async detectDeadSockets(): Promise<void> {
    const room = await this.ctx.storage.get<InternalRoomState>("room");
    if (!room) {
      return;
    }
    const now = Date.now();
    let changed = false;
    const staleSockets: WebSocket[] = [];

    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.deserializeAttachment(socket);
      if (!attachment) {
        continue; // join/spectateを送っていないソケットはまだ席を持たない
      }
      const lastActivityOf = (): number => {
        const lastResponse = this.ctx.getWebSocketAutoResponseTimestamp(socket);
        return lastResponse !== null ? lastResponse.getTime() : attachment.connectedAt;
      };
      if (!("playerId" in attachment)) {
        // 観戦ソケットも回収する。終了フレームが届かない切断で枠が埋まったままになると、
        // 部屋が終わるまでホスト画面を開けない（上限2本）
        if (now - lastActivityOf() > HEARTBEAT_DEAD_THRESHOLD_MS) {
          staleSockets.push(socket);
        }
        continue;
      }
      const playerId = attachment.playerId;
      // 一度もハートビートを送っていない接続はgetWebSocketAutoResponseTimestampがnullを返すため、
      // 接続時刻(connectedAt)を起点にする。webSocketClose/Errorが発火しない無応答切断を捕捉するため
      if (now - lastActivityOf() > HEARTBEAT_DEAD_THRESHOLD_MS) {
        // 同じ席に生きたソケットが別にあれば、その席は落とさない（再接続直後の誤判定を避ける）
        if (!this.hasOtherSocket(socket, playerId)) {
          const player = room.players.find((p) => p.id === playerId);
          if (player?.connected) {
            player.connected = false;
            changed = true;
          }
        }
        staleSockets.push(socket);
      }
    }

    if (changed) {
      this.reassignHostIfNeeded(room);
      await this.ctx.storage.put("room", room);
      // 閉じる前に最終状態を配信する（閉じたソケットは配信対象から外れるため）
      this.broadcastState(room);
    }

    for (const socket of staleSockets) {
      socket.close(1000, "heartbeat_timeout");
    }
  }

  // ホストが切断中なら、接続中の最古参加者へ自動移譲する。元ホストが復帰しても権限は戻さない。
  // 接続中の参加者が0人なら移譲先が見つからず、保留のまま次の接続を待つ（基本設計/01_サーバ.md）
  private reassignHostIfNeeded(room: InternalRoomState): void {
    const currentHost = room.players.find((p) => p.isHost);
    if (currentHost?.connected) {
      return;
    }
    const nextHost = room.players.find((p) => p.connected);
    if (!nextHost) {
      return;
    }
    for (const player of room.players) {
      player.isHost = false;
    }
    nextHost.isHost = true;
  }

  // アラームをmin(stageDeadline, expireAt)で再設定する。expireAtは最終アクセスのたびに現在+2時間で更新する
  private async updateAlarm(room: InternalRoomState): Promise<void> {
    // 過去の締切をそのまま採用しない。setAlarmは現在時刻以前を渡すと即座に発火するため、
    // 締切処理が空振りする状況（未登録gameId・rejectの戻り）では毎秒何百回も再発火する。
    // そのループ中もexpireAtが延び続けるため、部屋が破棄されなくなる
    const stageDeadline = room.deadline !== undefined && room.deadline > Date.now() ? room.deadline : undefined;
    const alarms: AlarmsState = {
      stageDeadline,
      expireAt: Date.now() + ROOM_EXPIRE_MS,
    };
    await this.ctx.storage.put("alarms", alarms);
    const next = alarms.stageDeadline !== undefined ? Math.min(alarms.stageDeadline, alarms.expireAt) : alarms.expireAt;
    await this.ctx.storage.setAlarm(next);
  }

  // --- GameTransitionの反映（storage書き込み→secret→state→resultの順） ---

  private async applyTransition(room: InternalRoomState, transition: GameTransition<unknown, unknown>): Promise<void> {
    if (transition.publicState !== undefined) {
      room.gameState = transition.publicState;
    }
    if (transition.stage !== undefined) {
      room.stage = transition.stage;
    }
    if (transition.deadlineSeconds !== undefined) {
      room.deadline = Date.now() + transition.deadlineSeconds * 1000;
    }
    if (transition.result !== undefined) {
      room.lifecycle = "finished";
      room.deadline = undefined;
    }

    let newSecrets: Map<string, unknown> | undefined;
    if (transition.secrets || transition.gameSecret !== undefined) {
      const secrets = await this.getSecrets();
      for (const [playerId, payload] of transition.secrets ?? []) {
        secrets.playerSecrets[playerId] = payload;
      }
      if (transition.gameSecret !== undefined) {
        secrets.gameSecret = transition.gameSecret;
      }
      await this.ctx.storage.put("secrets", secrets);
      newSecrets = transition.secrets;
    }

    await this.ctx.storage.put("room", room);
    await this.updateAlarm(room);

    if (newSecrets) {
      this.sendSecretsToConnectedPlayers(room, newSecrets);
    }
    this.broadcastState(room);

    if (transition.result !== undefined && room.gameId) {
      // 開示中の切断・DO再起動から戻った人にも同じ開示を届けられるよう保存する
      const secrets = await this.getSecrets();
      secrets.lastResult = { gameId: room.gameId, payload: transition.result };
      await this.ctx.storage.put("secrets", secrets);
      this.broadcastResult(room.gameId, transition.result);
    }
  }

  // --- 補助 ---

  private isHost(ws: WebSocket, room: InternalRoomState): boolean {
    const playerId = this.getAttachedPlayerId(ws);
    if (!playerId) {
      return false;
    }
    return room.players.find((p) => p.id === playerId)?.isHost === true;
  }

  private deserializeAttachment(ws: WebSocket): Attachment | null {
    return (ws.deserializeAttachment() as Attachment | null) ?? null;
  }

  /** 同じプレイヤーに紐づく別のソケットがあるか */
  private hasOtherSocket(ws: WebSocket, playerId: string): boolean {
    return this.ctx
      .getWebSockets()
      .some((socket) => socket !== ws && this.getAttachedPlayerId(socket) === playerId);
  }

  /** 再接続で置き換えられた同じ席の古いソケットを閉じる */
  private closeSupersededSockets(current: WebSocket, playerId: string): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== current && this.getAttachedPlayerId(socket) === playerId) {
        socket.close(1000, "superseded");
      }
    }
  }

  /**
   * ブロードキャストの宛先。`join` / `spectate` を済ませて身元が確定したソケットに限る。
   *
   * 接続しただけのソケットへ配ると、再接続の途中（新しいソケットを開いてからjoinを送るまで）に
   * `joined` より先に `state` が届き、クライアントが自分のplayerIdを知らないまま状態を受け取る
   */
  private identifiedSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => this.deserializeAttachment(socket) !== null);
  }

  private getAttachedPlayerId(ws: WebSocket): string | null {
    const attachment = this.deserializeAttachment(ws);
    if (attachment && "playerId" in attachment) {
      return attachment.playerId;
    }
    return null;
  }

  private sendSecretsToConnectedPlayers(room: InternalRoomState, secrets: Map<string, unknown>): void {
    if (!room.gameId) {
      return;
    }
    for (const socket of this.ctx.getWebSockets()) {
      const playerId = this.getAttachedPlayerId(socket);
      if (playerId && secrets.has(playerId)) {
        this.send(socket, { v: PROTOCOL_VERSION, type: "secret", gameId: room.gameId, payload: secrets.get(playerId) });
      }
    }
  }

  private broadcastState(room: InternalRoomState): void {
    const message = this.buildStateMessage(room);
    for (const socket of this.identifiedSockets()) {
      this.send(socket, message);
    }
  }

  private buildStateMessage(room: InternalRoomState): StateMessage {
    return { ...toPublicRoom(room), v: PROTOCOL_VERSION, type: "state", serverNow: Date.now() };
  }

  /** finishedのまま接続した人へ、開示済みのresultを再送する */
  private sendLastResult(ws: WebSocket, room: InternalRoomState, secrets: SecretsState): void {
    if (room.lifecycle !== "finished" || !secrets.lastResult) {
      return;
    }
    const { gameId, payload } = secrets.lastResult;
    this.send(ws, { v: PROTOCOL_VERSION, type: "result", gameId, payload });
  }

  private broadcastResult(gameId: string, payload: unknown): void {
    const message: ServerMessage = { v: PROTOCOL_VERSION, type: "result", gameId, payload };
    for (const socket of this.identifiedSockets()) {
      this.send(socket, message);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    // 閉じたソケットへのsendは例外になる。再接続で置き換えた古いソケットが
    // getWebSockets()の一覧にまだ残っている間があるため、状態を見てから送る。
    // 黙って捨てると配信欠落が観測できなくなるため、破棄したことは記録する（observabilityで拾う）
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`closed socket にメッセージを送ろうとした: type=${message.type} readyState=${ws.readyState}`);
      return;
    }
    ws.send(JSON.stringify(message));
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    const errorMessage: ErrorMessage = { v: PROTOCOL_VERSION, type: "error", code, message };
    this.send(ws, errorMessage);
  }

  private async getRoom(): Promise<InternalRoomState> {
    const room = await this.ctx.storage.get<InternalRoomState>("room");
    if (!room) {
      throw new Error("room is not initialized");
    }
    return room;
  }

  private async getSecrets(): Promise<SecretsState> {
    const secrets = await this.ctx.storage.get<SecretsState>("secrets");
    if (!secrets) {
      throw new Error("secrets are not initialized");
    }
    return secrets;
  }
}
