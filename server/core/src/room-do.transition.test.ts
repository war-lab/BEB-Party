// 受入条件7: GameTransition.rejectが返ったとき状態が変わらない。resultが返ったときlifecycleがfinishedになる
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

describe("GameTransitionの反映", () => {
  it("rejectが返るactionは状態を変えず、errorだけを送信者に返す", async () => {
    const code = uniqueRoomCode("transition-reject");
    const stub = await createRoom(code);
    const host = await openSocket(stub);

    const hostJoin = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    await hostJoin;
    const selectRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    await selectRecv;
    const startRecv = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "start" });
    await startRecv;

    // スタブはstage1で"finish"を受理しない(reject)。他のソケットには何も配信されないことを確認する
    const spectator = await openSocket(stub);
    const spectatorSpectate = collectMessages(spectator, 1);
    sendMessage(spectator, { v: 1, type: "spectate" });
    await spectatorSpectate;

    let spectatorGotAnotherMessage = false;
    spectator.addEventListener("message", () => {
      spectatorGotAnotherMessage = true;
    });

    const rejectRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "action", action: "finish" }); // stage1では拒否される
    const [error] = await rejectRecv;
    expect(error).toMatchObject({ type: "error", code: "invalid_action" });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(spectatorGotAnotherMessage).toBe(false); // stateがブロードキャストされていない = 状態不変
  });

  it("resultが返るとlifecycleがfinishedになり、resultが全員へ配信される", async () => {
    const code = uniqueRoomCode("transition-result");
    const stub = await createRoom(code);
    const host = await openSocket(stub);
    const hostJoin = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    await hostJoin;
    const selectRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    await selectRecv;
    const startRecv = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "start" });
    await startRecv;
    const advanceRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "action", action: "advance" });
    await advanceRecv;

    const spectator = await openSocket(stub);
    const spectatorSpectate = collectMessages(spectator, 1);
    sendMessage(spectator, { v: 1, type: "spectate" });
    await spectatorSpectate;

    const finishHost = collectMessages(host, 2); // state, result
    const finishSpectator = collectMessages(spectator, 2); // state, result
    sendMessage(host, { v: 1, type: "action", action: "finish" });
    const [state, result] = await finishHost;
    await finishSpectator;

    expect(state).toMatchObject({ type: "state", lifecycle: "finished" });
    expect(result).toMatchObject({ type: "result", gameId: STUB_GAME_ID, payload: { outcome: "win" } });
  });
});
