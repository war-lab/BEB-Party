// 受入条件1: スタブGameModuleだけで全ライフサイクル(lobby→playing→finished→lobby)が動く。
// このファイルは@beb/shared-coreとスタブGameModuleのみをimportし、実際のゲームモジュールパッケージを一切importしない。
import { beforeAll, describe, expect, it } from "vitest";
import { registry } from "./registry";
import { STUB_GAME_ID, stubGameModule } from "./test-support/stub-game-module";
import { collectMessages, createRoom, openSocket, sendMessage, uniqueRoomCode } from "./test-support/room-do-test-helpers";

beforeAll(() => {
  registry[STUB_GAME_ID] = stubGameModule;
});

describe("RoomDO 全ライフサイクル(スタブGameModule)", () => {
  it("lobby→playing→finished→lobbyの一巡が動く", async () => {
    const code = uniqueRoomCode("lifecycle");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    const hostRecv = collectMessages(host, 2); // joined, state
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    const [joined, state] = await hostRecv;
    expect(joined?.type).toBe("joined");
    expect(state?.type).toBe("state");
    expect(state).toMatchObject({ lifecycle: "lobby", players: [{ name: "Host", isHost: true }] });

    const guest = await openSocket(stub);
    const guestRecv = collectMessages(guest, 2);
    const hostRecvState2 = collectMessages(host, 1);
    sendMessage(guest, { v: 1, type: "join", name: "Guest", level: 2 });
    const [guestJoined] = await guestRecv;
    await hostRecvState2;
    expect(guestJoined?.type).toBe("joined");

    // selectGame
    const bothRecvSelect = Promise.all([collectMessages(host, 1), collectMessages(guest, 1)]);
    sendMessage(host, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    const [selectStateHost] = await bothRecvSelect;
    expect(selectStateHost[0]).toMatchObject({ gameId: STUB_GAME_ID });

    // configure
    const bothRecvConfigure = Promise.all([collectMessages(host, 1), collectMessages(guest, 1)]);
    sendMessage(host, { v: 1, type: "configure", contentId: "stub-content", settings: {} });
    await bothRecvConfigure;

    // start: 各自secret→state
    const hostStart = collectMessages(host, 2);
    const guestStart = collectMessages(guest, 2);
    sendMessage(host, { v: 1, type: "start" });
    const [hostSecret, hostState] = await hostStart;
    const [guestSecret] = await guestStart;
    expect(hostSecret?.type).toBe("secret");
    expect(guestSecret?.type).toBe("secret");
    expect(hostSecret).not.toEqual(guestSecret);
    expect(hostState).toMatchObject({ lifecycle: "playing", stage: "stage1" });

    // action: advance (stage1 -> stage2)
    const bothRecvAdvance = Promise.all([collectMessages(host, 1), collectMessages(guest, 1)]);
    sendMessage(host, { v: 1, type: "action", action: "advance" });
    const [advanceStateHost] = await bothRecvAdvance;
    expect(advanceStateHost[0]).toMatchObject({ stage: "stage2" });

    // action: finish -> result, lifecycle finished
    const bothRecvFinish = Promise.all([collectMessages(host, 2), collectMessages(guest, 2)]);
    sendMessage(host, { v: 1, type: "action", action: "finish" });
    const [finishHost] = await bothRecvFinish;
    const [finishState, finishResult] = finishHost;
    expect(finishState).toMatchObject({ lifecycle: "finished" });
    expect(finishResult).toMatchObject({ type: "result", gameId: STUB_GAME_ID, payload: { outcome: "win" } });

    // nextGame -> lobby。ADR-0011: gameId/contentId/settingsは全クリア
    const bothRecvNext = Promise.all([collectMessages(host, 1), collectMessages(guest, 1)]);
    sendMessage(host, { v: 1, type: "nextGame" });
    const [nextStateHost] = await bothRecvNext;
    expect(nextStateHost[0]).toMatchObject({ lifecycle: "lobby" });
    expect(nextStateHost[0]).not.toHaveProperty("gameId");
    expect(nextStateHost[0]).not.toHaveProperty("stage");
    expect(nextStateHost[0]).not.toHaveProperty("gameState");
  });
});
