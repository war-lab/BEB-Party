// 受入条件3: ホストを切断させた後、次点の参加者からstart/nextGameが受理される
// 受入条件4: 接続中の参加者が0人になった後、次に接続した者へホスト権限が与えられる
import { beforeAll, describe, expect, it } from "vitest";
import { registry } from "./registry";
import { STUB_CONTENT_ID, STUB_GAME_ID, stubGameModule } from "./test-support/stub-game-module";
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

describe("ホスト権限の自動移譲", () => {
  it("ホストが切断すると次点の参加者へ移譲され、startが受理される", async () => {
    const code = uniqueRoomCode("host-transfer");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    const hostJoin = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    await hostJoin;

    const guest = await openSocket(stub);
    const guestJoin = collectMessages(guest, 2);
    const hostRecvGuestJoin = collectMessages(host, 1);
    sendMessage(guest, { v: 1, type: "join", name: "Guest", level: 2 });
    await guestJoin;
    await hostRecvGuestJoin;

    // ホストを切断する。guestへ移譲後のstateブロードキャストを待つことで、
    // webSocketCloseの非同期処理が完了したタイミングと同期する
    const guestRecvTransfer = collectMessages(guest, 1);
    host.close();
    const [transferState] = await guestRecvTransfer;
    const guestPlayer = (transferState as { players: { name: string; isHost: boolean }[] }).players.find(
      (p) => p.name === "Guest",
    );
    expect(guestPlayer?.isHost).toBe(true);

    // 次点参加者(guest)からのselectGame/configure/startが受理される
    const selectRecv = collectMessages(guest, 1);
    sendMessage(guest, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    const [selectState] = await selectRecv;
    expect(selectState).toMatchObject({ gameId: STUB_GAME_ID });

    const configureRecv = collectMessages(guest, 1);
    sendMessage(guest, { v: 1, type: "configure", contentId: STUB_CONTENT_ID, settings: {} });
    await configureRecv;

    const startRecv = collectMessages(guest, 2); // secret, state
    sendMessage(guest, { v: 1, type: "start" });
    const [, startState] = await startRecv;
    expect(startState).toMatchObject({ type: "state", lifecycle: "playing" });
  });

  it("接続中の参加者が0人になった後、次に接続した者へホスト権限が与えられる", async () => {
    const code = uniqueRoomCode("host-transfer-zero");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    const hostJoin = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    await hostJoin;

    // 唯一の参加者(ホスト)が切断し、接続中の参加者が0人になる
    host.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 次に接続した参加者がホストになる
    const newcomer = await openSocket(stub);
    const newcomerJoin = collectMessages(newcomer, 2);
    sendMessage(newcomer, { v: 1, type: "join", name: "Newcomer", level: 1 });
    const [, state] = await newcomerJoin;
    const newcomerPlayer = (state as { players: { name: string; isHost: boolean }[] }).players.find(
      (p) => p.name === "Newcomer",
    );
    expect(newcomerPlayer?.isHost).toBe(true);
  });
});
