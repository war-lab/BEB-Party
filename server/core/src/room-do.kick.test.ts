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

type Stub = Awaited<ReturnType<typeof createRoom>>;
type Joined = { playerId: string; reconnectToken: string };
type PlayersState = { players: { id: string; name: string; connected: boolean }[] };

async function join(ws: WebSocket, name: string, reconnectToken?: string): Promise<Joined> {
  const recv = collectMessages(ws, 2); // joined, state
  sendMessage(ws, { v: 1, type: "join", name, level: 3, ...(reconnectToken ? { reconnectToken } : {}) });
  const [joined] = await recv;
  return joined as unknown as Joined;
}

/** 状態を変えない観戦ソケットで、いまの席の並びを読む */
async function playerNames(stub: Stub): Promise<string[]> {
  const spectator = await openSocket(stub);
  const recv = collectMessages(spectator, 1);
  sendMessage(spectator, { v: 1, type: "spectate" });
  const [state] = await recv;
  spectator.close();
  return (state as unknown as PlayersState).players.map((p) => p.name);
}

/** 失効済みのトークンで join し、kicked が返ることを確かめる */
async function expectKicked(stub: Stub, reconnectToken: string): Promise<WebSocket> {
  const socket = await openSocket(stub);
  const recv = collectMessages(socket, 1);
  sendMessage(socket, { v: 1, type: "join", name: "Guest", level: 3, reconnectToken });
  const [error] = await recv;
  expect(error).toMatchObject({ type: "error", code: "kicked" });
  return socket;
}

/** 一定時間のうちに close が届かないことを確かめる。サーバの close は非同期に届くため、直後の readyState では判定できない */
async function expectStaysOpen(ws: WebSocket, waitMs = 500): Promise<void> {
  let closed = false;
  ws.addEventListener("close", () => (closed = true));
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  expect(closed).toBe(false);
  expect(ws.readyState).toBe(WebSocket.OPEN);
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

async function kick(host: WebSocket, playerId: string): Promise<void> {
  const recv = collectMessages(host, 1);
  sendMessage(host, { v: 1, type: "kick", playerId });
  const [state] = await recv;
  expect(state).toMatchObject({ type: "state" });
}

describe("kick", () => {
  it("ホストが切断中の参加者を外すと席が消え、その人の再接続トークンはkickedで止まる", async () => {
    const { stub, host, guest } = await roomWithDisconnectedGuest("kick-basic");

    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "kick", playerId: guest.playerId });
    const [state] = await recv;
    expect((state as unknown as PlayersState).players.map((p) => p.name)).toEqual(["Host"]);

    // 外された端末の自動再接続。席を作らない
    const returning = await expectKicked(stub, guest.reconnectToken);
    // ソケットは閉じない。閉じると kicked を知らない旧SPAが再接続を繰り返す（ADR-0028）
    await expectStaysOpen(returning);

    // 同じソケットから、トークンを持たないjoinで新しい席に入り直せる
    const hostRecvRejoin = collectMessages(host, 1);
    const fresh = await join(returning, "Guest");
    const [afterRejoin] = await hostRecvRejoin;
    expect(fresh.playerId).not.toBe(guest.playerId);
    expect(fresh.reconnectToken).not.toBe(guest.reconnectToken);
    expect((afterRejoin as unknown as PlayersState).players.map((p) => p.name)).toEqual(["Host", "Guest"]);
  });

  it("失効させたトークンは、ゲーム中も次のゲームのロビーでもkickedで止まる", async () => {
    const { stub, host, guest } = await roomWithDisconnectedGuest("kick-lifecycles");
    await kick(host, guest.playerId);

    // playing。照合できないトークンの既定の扱い（game_in_progress）より先に kicked を返す
    await selectGameAndContent(host, STUB_GAME_ID, STUB_CONTENT_ID);
    const startRecv = collectMessages(host, 2); // secret, state
    sendMessage(host, { v: 1, type: "start" });
    await startRecv;
    await expectKicked(stub, guest.reconnectToken);

    // finished → nextGame でロビーへ戻っても失効は残る
    const advanceRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "action", action: "advance" });
    await advanceRecv;
    const finishRecv = collectMessages(host, 2); // state, result
    sendMessage(host, { v: 1, type: "action", action: "finish" });
    await finishRecv;
    await expectKicked(stub, guest.reconnectToken);
    const nextRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "nextGame" });
    const [lobby] = await nextRecv;
    expect(lobby).toMatchObject({ type: "state", lifecycle: "lobby" });
    await expectKicked(stub, guest.reconnectToken);
    expect(await playerNames(stub)).toEqual(["Host"]);
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
    await kick(host, absent!.playerId);

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

    // 自分自身の指定は、送信者が接続中であるため connected の判定でも拒否される。
    // 自己判定の分岐単独には到達しない（送信者が切断扱いなら、その送信自体が届かない）。ここでは結果だけを固定する
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

  it("ホスト以外からのkickはnot_hostで拒否し、状態を変えない", async () => {
    const { stub, guest } = await roomWithDisconnectedGuest("kick-not-host");
    const other = await openSocket(stub);
    await join(other, "Other");

    const recv = collectMessages(other, 1);
    sendMessage(other, { v: 1, type: "kick", playerId: guest.playerId });
    expect((await recv)[0]).toMatchObject({ type: "error", code: "not_host" });
    expect(await playerNames(stub)).toEqual(["Host", "Guest", "Other"]);
  });

  it("ゲーム中のkickはinvalid_lifecycleで拒否し、状態を変えない", async () => {
    const { stub, host, guest } = await roomWithDisconnectedGuest("kick-playing");
    await selectGameAndContent(host, STUB_GAME_ID, STUB_CONTENT_ID);
    const startRecv = collectMessages(host, 2); // secret, state
    sendMessage(host, { v: 1, type: "start" });
    const [, started] = await startRecv;
    expect(started).toMatchObject({ type: "state", lifecycle: "playing" });

    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "kick", playerId: guest.playerId });
    expect((await recv)[0]).toMatchObject({ type: "error", code: "invalid_lifecycle" });
    expect(await playerNames(stub)).toEqual(["Host", "Guest"]);
  });
});
