// 席の作られ方の制限（基本設計/01のプレイヤーの認証と再接続、人数上限）
// - 1ソケット1席。join済みのソケットからの再申告は受け付けない
// - join済みのソケットをspectateへ転向させない
// - 人数上限を超えるjoinはroom_fullで拒否する
//
// いずれも「対応するソケットを持たない席（幽霊席）」を作らないための制限である。
// 幽霊席はconnected: trueのまま残り、切断も死活判定も効かないため、
// ホスト権限が固まって部屋が操作不能になる
import { beforeAll, describe, expect, it } from "vitest";
import { registry } from "./registry";
import { STUB_GAME_ID, stubGameModule } from "./test-support/stub-game-module";
import {
  collectMessages,
  createRoom,
  openSocket,
  sendMessage,
  uniqueRoomCode,
} from "./test-support/room-do-test-helpers";

beforeAll(() => {
  registry[STUB_GAME_ID] = stubGameModule;
});

async function joinPlayer(ws: WebSocket, name: string): Promise<void> {
  const recv = collectMessages(ws, 2); // joined, state
  sendMessage(ws, { v: 1, type: "join", name, level: 3 });
  await recv;
}

describe("席の作られ方", () => {
  it("同じソケットからの2回目のjoinを拒否する", async () => {
    const code = uniqueRoomCode("double-join");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    await joinPlayer(host, "Host");

    const errorRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "join", name: "Ghost", level: 3 });
    const [error] = await errorRecv;
    expect(error).toMatchObject({ type: "error", code: "invalid_lifecycle" });

    // 席は増えていない
    const guest = await openSocket(stub);
    const guestRecv = collectMessages(guest, 2);
    sendMessage(guest, { v: 1, type: "join", name: "Guest", level: 3 });
    const [, state] = await guestRecv;
    expect((state as { players: unknown[] }).players).toHaveLength(2);
  });

  it("join済みのソケットからのspectateを拒否する", async () => {
    const code = uniqueRoomCode("join-then-spectate");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    await joinPlayer(host, "Host");

    const errorRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "spectate" });
    const [error] = await errorRecv;
    expect(error).toMatchObject({ type: "error", code: "invalid_lifecycle" });

    // ホストの席は生きたまま。切断すればconnected: falseになる
    const guest = await openSocket(stub);
    const guestRecv = collectMessages(guest, 2);
    sendMessage(guest, { v: 1, type: "join", name: "Guest", level: 3 });
    await guestRecv;

    const stateRecv = collectMessages(guest, 1);
    host.close();
    const [state] = await stateRecv;
    const players = (state as { players: { name: string; connected: boolean }[] }).players;
    expect(players.find((player) => player.name === "Host")?.connected).toBe(false);
  });

  it("人数上限を超えるjoinをroom_fullで拒否する", async () => {
    const code = uniqueRoomCode("room-full");
    const stub = await createRoom(code);

    // stubGameModuleの上限は8人。ゲーム未選択のロビーはレジストリ内の最大値を上限にする
    const capacity = Math.max(...Object.values(registry).map((module) => module.playerCount[1]));
    for (let index = 0; index < capacity; index += 1) {
      const socket = await openSocket(stub);
      await joinPlayer(socket, `Player${index + 1}`);
    }

    const overflow = await openSocket(stub);
    const errorRecv = collectMessages(overflow, 1);
    sendMessage(overflow, { v: 1, type: "join", name: "TooMany", level: 3 });
    const [error] = await errorRecv;
    expect(error).toMatchObject({ type: "error", code: "room_full" });
  });
});

describe("メッセージの流量", () => {
  it("1ソケットからの連打をrate_limitedで打ち切る", async () => {
    const code = uniqueRoomCode("message-rate");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    await joinPlayer(host, "Host");

    // 未登録のgameIdを連打する。1通ごとにunknown_gameが返るが、上限を超えるとrate_limitedに変わる
    const burst = 30;
    const received = collectMessages(host, burst);
    for (let index = 0; index < burst; index += 1) {
      sendMessage(host, { v: 1, type: "selectGame", gameId: "no-such-game" });
    }
    const messages = await received;

    const codes = messages.map((message) => (message as { code?: string }).code);
    expect(codes[0]).toBe("unknown_game");
    expect(codes[burst - 1]).toBe("rate_limited");
    // 上限（20通/10秒）を超えた分は処理していない
    expect(codes.filter((entry) => entry === "unknown_game").length).toBeLessThanOrEqual(20);
    expect(codes.filter((entry) => entry === "rate_limited").length).toBeGreaterThan(0);
  });
});
