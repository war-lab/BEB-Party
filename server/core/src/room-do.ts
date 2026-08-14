import { DurableObject } from "cloudflare:workers";
import {
  ERROR_CODES,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  PROTOCOL_VERSION,
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
type Attachment = { playerId: string; connectedAt: number } | { spectator: true };

const SPECTATOR_LIMIT = 2;

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

    const playerId = generatePlayerId();
    const reconnectToken = generateReconnectToken();
    const player: Player = {
      id: playerId,
      name: message.name,
      level: message.level,
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
    this.send(ws, { v: PROTOCOL_VERSION, type: "joined", playerId: player.id, reconnectToken });
    this.broadcastState(room);

    if (room.lifecycle === "playing" || room.lifecycle === "finished") {
      const payload = secrets.playerSecrets[player.id];
      if (payload !== undefined && room.gameId) {
        this.send(ws, { v: PROTOCOL_VERSION, type: "secret", gameId: room.gameId, payload });
      }
    }
  }

  private async handleSpectate(ws: WebSocket): Promise<void> {
    const spectatorCount = this.ctx.getWebSockets().filter((socket) => {
      const attachment = this.deserializeAttachment(socket);
      return attachment !== null && "spectator" in attachment;
    }).length;

    if (spectatorCount >= SPECTATOR_LIMIT) {
      this.sendError(ws, ERROR_CODES.SPECTATOR_LIMIT, "spectator limit reached");
      ws.close(1008, "spectator_limit");
      return;
    }

    ws.serializeAttachment({ spectator: true } satisfies Attachment);
    const room = await this.getRoom();
    this.send(ws, this.buildStateMessage(room));
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
    const transition = gameModule.onDeadline({ room: toPublicRoom(room), publicState: room.gameState });
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
      if (!attachment || !("playerId" in attachment)) {
        continue; // 観戦ソケットは対象外
      }
      const playerId = attachment.playerId;
      // 一度もハートビートを送っていない接続はgetWebSocketAutoResponseTimestampがnullを返すため、
      // 接続時刻(connectedAt)を起点にする。webSocketClose/Errorが発火しない無応答切断を捕捉するため
      const lastResponse = this.ctx.getWebSocketAutoResponseTimestamp(socket);
      const lastActivity = lastResponse !== null ? lastResponse.getTime() : attachment.connectedAt;
      if (now - lastActivity > HEARTBEAT_DEAD_THRESHOLD_MS) {
        const player = room.players.find((p) => p.id === playerId);
        if (player?.connected) {
          player.connected = false;
          changed = true;
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
    const alarms: AlarmsState = {
      stageDeadline: room.deadline,
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
    if (transition.secrets) {
      const secrets = await this.getSecrets();
      for (const [playerId, payload] of transition.secrets) {
        secrets.playerSecrets[playerId] = payload;
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
    for (const socket of this.ctx.getWebSockets()) {
      this.send(socket, message);
    }
  }

  private buildStateMessage(room: InternalRoomState): StateMessage {
    return { ...toPublicRoom(room), v: PROTOCOL_VERSION, type: "state", serverNow: Date.now() };
  }

  private broadcastResult(gameId: string, payload: unknown): void {
    const message: ServerMessage = { v: PROTOCOL_VERSION, type: "result", gameId, payload };
    for (const socket of this.ctx.getWebSockets()) {
      this.send(socket, message);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
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
