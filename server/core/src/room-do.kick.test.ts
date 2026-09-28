// ロビーでホストが切断中の参加者を外す（ADR-0028、基本設計/01のメッセージ処理）
// - 受理するのは lobby・ホスト・切断中の他人に限る
// - 外した人の席は空き、その端末の自動再接続は kicked で止まる。トークンを持たない join なら入り直せる
import { beforeAll, describe, expect, it } from "vitest";
import { registry } from "./registry";
import { STUB_CONTENT_ID, STUB_GAME_ID, stubGameModule } from "./test-support/stub-game-module";
import {
  collectMessages,
  createRoom,
  openSocket,
  selectGameAndContent,
  sendMessage,
  uniqueRoomCode,
} from "./test-support/room-do-test-helpers";

beforeAll(() => {
  registry[STUB_GAME_ID] = stubGameModule;
});

type Joined = { playerId: string; reconnectToken: string };
type PlayersState = { players: { id: string; name: string; connected: boolean }[] };

async function join(ws: WebSocket, name: string, reconnectToken?: string): Promise<Joined> {
  const recv = collectMessages(ws, 2); // joined, state
  sendMessage(ws, { v: 1, type: "join", name, level: 3, ...(reconnectToken ? { reconnectToken } : {}) });
  const [joined] = await recv;
  return joined as unknown as Joined;
}

/** ホストと、切断させたゲストのいる部屋を作る */
async function roomWithDisconnectedGuest(prefix: string) {
  const stub = await createRoom(uniqueRoomCode(prefix));
  const host = await openSocket(stub);
  await join(host, "Host");
  const guestSocket = await openSocket(stub);
  const hostRecvJoin = collectMessages(host, 1);
  const guest = await join(guestSocket, "Guest");
  await hostRecvJoin;

  // 切断のstateを待ってwebSocketCloseの処理完了と同期する
  const hostRecvClose = collectMessages(host, 1);
  guestSocket.close();
  const [closed] = await hostRecvClose;
  expect((closed as unknown as PlayersState).players.find((p) => p.id === guest.playerId)?.connected).toBe(false);
  return { stub, host, guest };
}

describe("kick", () => {
  it("ホストが切断中の参加者を外すと席が消え、その人の再接続トークンはkickedで止まる", async () => {
    const { stub, host, guest } = await roomWithDisconnectedGuest("kick-basic");

    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "kick", playerId: guest.playerId });
    const [state] = await recv;
    expect((state as unknown as PlayersState).players.map((p) => p.name)).toEqual(["Host"]);

    // 外された端末の自動再接続。席を作らず、ソケットも閉じない
    const returning = await openSocket(stub);
    const rejected = collectMessages(returning, 1);
    sendMessage(returning, { v: 1, type: "join", name: "Guest", level: 3, reconnectToken: guest.reconnectToken });
    const [error] = await rejected;
    expect(error).toMatchObject({ type: "error", code: "kicked" });
    expect(returning.readyState).toBe(WebSocket.OPEN);

    // トークンを持たないjoinなら、新しい席で入り直せる
    const rejoined = await openSocket(stub);
    const hostRecvRejoin = collectMessages(host, 1);
    const fresh = await join(rejoined, "Guest");
    const [afterRejoin] = await hostRecvRejoin;
    expect(fresh.playerId).not.toBe(guest.playerId);
    expect((afterRejoin as unknown as PlayersState).players.map((p) => p.name)).toEqual(["Host", "Guest"]);
  });

  it("満員の部屋で切断中の人を外すと、新しい人が入れる", async () => {
    const stub = await createRoom(uniqueRoomCode("kick-capacity"));
    const host = await openSocket(stub);
    await join(host, "Host");
    // 上限の小さいゲームを選ぶ代わりに、stubの上限（8人）まで埋める
    const capacity = stubGameModule.playerCount[1];
    await selectGameAndContent(host, STUB_GAME_ID, STUB_CONTENT_ID);
    const sockets: WebSocket[] = [];
    let absent: Joined | undefined;
    for (let index = 1; index < capacity; index += 1) {
      const socket = await openSocket(stub);
      const hostRecv = collectMessages(host, 1);
      const joined = await join(socket, `Player${index + 1}`);
      await hostRecv;
      sockets.push(socket);
      absent ??= joined;
    }

    const overflow = await openSocket(stub);
    const full = collectMessages(overflow, 1);
    sendMessage(overflow, { v: 1, type: "join", name: "Late", level: 3 });
    expect((await full)[0]).toMatchObject({ type: "error", code: "room_full" });

    const hostRecvClose = collectMessages(host, 1);
    sockets[0]!.close();
    await hostRecvClose;
    const hostRecvKick = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "kick", playerId: absent!.playerId });
    await hostRecvKick;

    const late = await openSocket(stub);
    const joined = await join(late, "Late");
    expect(joined.playerId).toBeTruthy();
  });

  it("接続中の参加者・自分自身・存在しない参加者はinvalid_payloadで拒否し、状態を変えない", async () => {
    const stub = await createRoom(uniqueRoomCode("kick-invalid"));
    const host = await openSocket(stub);
    const hostJoined = await join(host, "Host");
    const guestSocket = await openSocket(stub);
    const hostRecvJoin = collectMessages(host, 1);
    const guest = await join(guestSocket, "Guest");
    await hostRecvJoin;

    for (const playerId of [guest.playerId, hostJoined.playerId, "no-such-player"]) {
      const recv = collectMessages(host, 1);
      sendMessage(host, { v: 1, type: "kick", playerId });
      expect((await recv)[0]).toMatchObject({ type: "error", code: "invalid_payload" });
    }

    // 席は2つのまま。ゲストの再接続も通る
    const again = await openSocket(stub);
    const recv = collectMessages(again, 2);
    sendMessage(again, { v: 1, type: "join", name: "Guest", level: 3, reconnectToken: guest.reconnectToken });
    const [joined, state] = await recv;
    expect(joined).toMatchObject({ type: "joined", playerId: guest.playerId });
    expect((state as unknown as PlayersState).players).toHaveLength(2);
  });

  it("ホスト以外からのkickはnot_hostで拒否する", async () => {
    const { stub, guest } = await roomWithDisconnectedGuest("kick-not-host");
    const other = await openSocket(stub);
    await join(other, "Other");

    const recv = collectMessages(other, 1);
    sendMessage(other, { v: 1, type: "kick", playerId: guest.playerId });
    expect((await recv)[0]).toMatchObject({ type: "error", code: "not_host" });
  });

  it("ゲーム中のkickはinvalid_lifecycleで拒否する", async () => {
    const { host, guest } = await roomWithDisconnectedGuest("kick-playing");
    await selectGameAndContent(host, STUB_GAME_ID, STUB_CONTENT_ID);
    const startRecv = collectMessages(host, 2); // secret, state
    sendMessage(host, { v: 1, type: "start" });
    const [, started] = await startRecv;
    expect(started).toMatchObject({ type: "state", lifecycle: "playing" });

    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "kick", playerId: guest.playerId });
    expect((await recv)[0]).toMatchObject({ type: "error", code: "invalid_lifecycle" });
  });
});
