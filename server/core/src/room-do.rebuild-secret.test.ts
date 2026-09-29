// 再接続で秘密情報を作り直す（ADR-0029）。
// 保存済みの値を送ると、デプロイをまたいだ部屋へ旧版の形と内容のまま届く。これを防ぐ経路を検査する
import { beforeAll, describe, expect, it } from "vitest";
import type { GameModule } from "@beb/shared-core";
import { registry } from "./registry";
import {
  STUB_CONTENT_ID,
  stubGameModule,
  type StubGameSecret,
  type StubPublicState,
  type StubResult,
  type StubSecret,
} from "./test-support/stub-game-module";
import {
  collectMessages,
  createRoom,
  openSocket,
  selectGameAndContent,
  sendMessage,
  uniqueRoomCode,
} from "./test-support/room-do-test-helpers";

type StubModule = GameModule<StubPublicState, StubSecret, StubResult, StubGameSecret>;

// 受け取った入力を秘密情報に書き込み、共通コアが何を渡したかを受信側で観測する
const REBUILD_GAME_ID = "stub-rebuild";
const rebuildModule: StubModule = {
  ...stubGameModule,
  rebuildSecret: ({ room, publicState, gameSecret, playerId }) => ({
    hint: `rebuilt:${playerId}:${room.lifecycle}:${room.stage}:${publicState.stage}:${gameSecret?.advanceCount}`,
  }),
};

const THROWING_GAME_ID = "stub-rebuild-throws";
const throwingModule: StubModule = {
  ...stubGameModule,
  rebuildSecret: () => {
    throw new Error("content not found");
  },
};

const NONE_GAME_ID = "stub-rebuild-none";
const noneModule: StubModule = {
  ...stubGameModule,
  rebuildSecret: () => undefined,
};

beforeAll(() => {
  registry[REBUILD_GAME_ID] = rebuildModule as unknown as GameModule<unknown, unknown, unknown>;
  registry[THROWING_GAME_ID] = throwingModule as unknown as GameModule<unknown, unknown, unknown>;
  registry[NONE_GAME_ID] = noneModule as unknown as GameModule<unknown, unknown, unknown>;
});

/** 1人で部屋を作ってゲームを始め、start時のsecretと再接続用のトークンを返す */
async function startGame(label: string, gameId: string) {
  const stub = await createRoom(uniqueRoomCode(label));
  const host = await openSocket(stub);
  const hostJoin = collectMessages(host, 2);
  sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
  const [joined] = await hostJoin;
  const reconnectToken = (joined as { reconnectToken: string }).reconnectToken;
  const playerId = (joined as { playerId: string }).playerId;

  await selectGameAndContent(host, gameId, STUB_CONTENT_ID);
  const startRecv = collectMessages(host, 2); // secret, state
  sendMessage(host, { v: 1, type: "start" });
  const [startSecret] = await startRecv;
  return { stub, host, reconnectToken, playerId, startSecret };
}

async function reconnect(stub: Awaited<ReturnType<typeof createRoom>>, reconnectToken: string, count: number) {
  const socket = await openSocket(stub);
  const recv = collectMessages(socket, count);
  sendMessage(socket, { v: 1, type: "join", name: "Host", level: 3, reconnectToken });
  return { socket, messages: await recv };
}

describe("再接続で秘密情報を作り直す", () => {
  it("rebuildSecretがあれば、保存済みの値ではなく作り直した値を送る", async () => {
    const { stub, host, reconnectToken, playerId, startSecret } = await startGame("rebuild", REBUILD_GAME_ID);
    expect(startSecret).toMatchObject({ type: "secret", payload: { hint: `secret-for-${playerId}` } });

    // gameSecretとstageを進め、作り直しに最新の状態が渡ることを見る
    const advanceRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "action", action: "advance" });
    await advanceRecv;
    host.close();

    const { messages } = await reconnect(stub, reconnectToken, 3); // joined, state, secret
    expect(messages[2]).toEqual({
      v: 1,
      type: "secret",
      gameId: REBUILD_GAME_ID,
      payload: { hint: `rebuilt:${playerId}:playing:stage2:stage2:1` },
    });
  });

  it("finishedでも作り直した値を送り、開示済みの結果は保存済みの値を送る", async () => {
    const { stub, host, reconnectToken, playerId } = await startGame("rebuild-finished", REBUILD_GAME_ID);
    const advanceRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "action", action: "advance" });
    await advanceRecv;
    const finishRecv = collectMessages(host, 2); // state, result
    sendMessage(host, { v: 1, type: "action", action: "finish" });
    const [, result] = await finishRecv;
    host.close();

    const { messages } = await reconnect(stub, reconnectToken, 4); // joined, state, secret, result
    expect(messages[2]).toMatchObject({
      type: "secret",
      payload: { hint: `rebuilt:${playerId}:finished:stage2:stage2:1` },
    });
    expect(messages[3]).toEqual(result);
  });

  it("rebuildSecretが例外を投げたら、保存済みの値を送る", async () => {
    const { stub, host, reconnectToken, startSecret } = await startGame("rebuild-throws", THROWING_GAME_ID);
    host.close();

    const { messages } = await reconnect(stub, reconnectToken, 3);
    expect(messages[2]).toEqual(startSecret);
  });

  it("rebuildSecretがundefinedを返したら、秘密情報を送らない", async () => {
    const { stub, host, reconnectToken } = await startGame("rebuild-none", NONE_GAME_ID);
    host.close();

    const { socket, messages } = await reconnect(stub, reconnectToken, 2); // joined, state
    expect(messages.map((m) => m?.type)).toEqual(["joined", "state"]);

    let secretArrived = false;
    socket.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
      if (JSON.parse(raw).type === "secret") {
        secretArrived = true;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(secretArrived).toBe(false);
  });
});
