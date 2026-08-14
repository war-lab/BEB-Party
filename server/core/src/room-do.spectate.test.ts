// 受入条件6: spectateのみのソケットにsecretが届かない。3本目のspectateがspectator_limitで拒否される
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

describe("観戦ソケット", () => {
  it("spectateのみのソケットにsecretが届かない", async () => {
    const code = uniqueRoomCode("spectate-no-secret");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    const hostJoin = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    await hostJoin;

    const spectator = await openSocket(stub);
    const spectateRecv = collectMessages(spectator, 1);
    sendMessage(spectator, { v: 1, type: "spectate" });
    await spectateRecv;

    let spectatorGotSecret = false;
    spectator.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
      if (JSON.parse(raw).type === "secret") {
        spectatorGotSecret = true;
      }
    });

    const selectRecv = collectMessages(host, 1);
    const spectatorSelectState = collectMessages(spectator, 1);
    sendMessage(host, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    await selectRecv;
    await spectatorSelectState;

    const startRecv = collectMessages(host, 2);
    const spectatorStartState = collectMessages(spectator, 1); // stateのみ届く想定
    sendMessage(host, { v: 1, type: "start" });
    await startRecv;
    await spectatorStartState;

    expect(spectatorGotSecret).toBe(false);
  });

  it("2本まで観戦を許可し、3本目はspectator_limitで拒否される", async () => {
    const code = uniqueRoomCode("spectate-limit");
    const stub = await createRoom(code);

    const spectator1 = await openSocket(stub);
    const s1Recv = collectMessages(spectator1, 1);
    sendMessage(spectator1, { v: 1, type: "spectate" });
    await s1Recv;

    const spectator2 = await openSocket(stub);
    const s2Recv = collectMessages(spectator2, 1);
    sendMessage(spectator2, { v: 1, type: "spectate" });
    await s2Recv;

    const spectator3 = await openSocket(stub);
    const s3Recv = collectMessages(spectator3, 1);
    sendMessage(spectator3, { v: 1, type: "spectate" });
    const [error] = await s3Recv;
    expect(error).toMatchObject({ type: "error", code: "spectator_limit" });
  });
});
