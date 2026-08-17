// 受入条件2: lifecycle×メッセージ表の全組み合わせで、表にないものがerrorになる（01_サーバ.mdのメッセージ処理表）
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

type Lifecycle = "lobby" | "playing" | "finished";

async function setupRoomAtStage(code: string, stage: Lifecycle) {
  const stub = await createRoom(code);
  const host = await openSocket(stub);
  const hostJoin = collectMessages(host, 2);
  sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
  await hostJoin;

  if (stage === "lobby") {
    return { stub, host };
  }

  await selectGameAndContent(host, STUB_GAME_ID, STUB_CONTENT_ID);

  const startRecv = collectMessages(host, 2); // secret, state
  sendMessage(host, { v: 1, type: "start" });
  await startRecv;

  if (stage === "playing") {
    return { stub, host };
  }

  // finished: advance -> finish
  const advanceRecv = collectMessages(host, 1);
  sendMessage(host, { v: 1, type: "action", action: "advance" });
  await advanceRecv;
  const finishRecv = collectMessages(host, 2); // state, result
  sendMessage(host, { v: 1, type: "action", action: "finish" });
  await finishRecv;

  return { stub, host };
}

describe("メッセージ処理表: 表にない組み合わせはerror", () => {
  it("lobby中のactionはinvalid_lifecycleで拒否され、状態が変わらない", async () => {
    const { host } = await setupRoomAtStage(uniqueRoomCode("mt-lobby-action"), "lobby");
    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "action", action: "advance" });
    const [error] = await recv;
    expect(error).toMatchObject({ type: "error", code: "invalid_lifecycle" });
  });

  it("lobby中のnextGameはinvalid_lifecycleで拒否される", async () => {
    const { host } = await setupRoomAtStage(uniqueRoomCode("mt-lobby-next"), "lobby");
    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "nextGame" });
    const [error] = await recv;
    expect(error).toMatchObject({ type: "error", code: "invalid_lifecycle" });
  });

  it("playing中のselectGame/configure/start/nextGameはinvalid_lifecycleで拒否される", async () => {
    const { host } = await setupRoomAtStage(uniqueRoomCode("mt-playing"), "playing");

    for (const message of [
      { v: 1, type: "selectGame", gameId: STUB_GAME_ID },
      { v: 1, type: "configure", settings: {} },
      { v: 1, type: "start" },
      { v: 1, type: "nextGame" },
    ]) {
      const recv = collectMessages(host, 1);
      sendMessage(host, message);
      const [error] = await recv;
      expect(error).toMatchObject({ type: "error", code: "invalid_lifecycle" });
    }
  });

  it("finished中のselectGame/configure/start/actionはinvalid_lifecycleで拒否される", async () => {
    const { host } = await setupRoomAtStage(uniqueRoomCode("mt-finished"), "finished");

    for (const message of [
      { v: 1, type: "selectGame", gameId: STUB_GAME_ID },
      { v: 1, type: "configure", settings: {} },
      { v: 1, type: "start" },
      { v: 1, type: "action", action: "advance" },
    ]) {
      const recv = collectMessages(host, 1);
      sendMessage(host, message);
      const [error] = await recv;
      expect(error).toMatchObject({ type: "error", code: "invalid_lifecycle" });
    }
  });

  it("ホスト以外のselectGame/configure/start/nextGameはnot_hostで拒否される", async () => {
    const code = uniqueRoomCode("mt-not-host");
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

    const recv = collectMessages(guest, 1);
    sendMessage(guest, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    const [error] = await recv;
    expect(error).toMatchObject({ type: "error", code: "not_host" });
  });

  it("未登録gameIdのselectGameはunknown_gameで拒否される", async () => {
    const { host } = await setupRoomAtStage(uniqueRoomCode("mt-unknown-game"), "lobby");
    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "selectGame", gameId: "no-such-game" });
    const [error] = await recv;
    expect(error).toMatchObject({ type: "error", code: "unknown_game" });
  });

  it("範囲外settingsのconfigureはinvalid_payloadで拒否され、保存されない", async () => {
    const code = uniqueRoomCode("mt-invalid-settings");
    const stub = await createRoom(code);
    const host = await openSocket(stub);
    const hostJoin = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    await hostJoin;
    const selectRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    await selectRecv;

    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "configure", contentId: "poison-content", settings: { invalid: true } });
    const [error] = await recv;
    expect(error).toMatchObject({ type: "error", code: "invalid_payload" });

    // 拒否されたcontentIdが保存されていないことを、状態を変更しないspectateの読み取りで確認する
    const spectator = await openSocket(stub);
    const spectateRecv = collectMessages(spectator, 1);
    sendMessage(spectator, { v: 1, type: "spectate" });
    const [state] = await spectateRecv;
    expect(state).not.toHaveProperty("contentId");
  });

  it("未登録contentIdのconfigureはinvalid_payloadで拒否される", async () => {
    // settingsが妥当でもcontentIdが未登録なら拒否する。保存するとstartでゲームモジュールが引けない
    const code = uniqueRoomCode("mt-unknown-content");
    const stub = await createRoom(code);
    const host = await openSocket(stub);
    const hostJoin = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    await hostJoin;
    const selectRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    await selectRecv;

    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "configure", contentId: "no-such-content", settings: {} });
    const [error] = await recv;
    expect(error).toMatchObject({ type: "error", code: "invalid_payload" });
  });

  it("コンテンツ未選択のstartはinvalid_payloadで拒否される", async () => {
    const code = uniqueRoomCode("mt-no-content");
    const stub = await createRoom(code);
    const host = await openSocket(stub);
    const hostJoin = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    await hostJoin;
    const selectRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    await selectRecv;

    const recv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "start" });
    const [error] = await recv;
    expect(error).toMatchObject({ type: "error", code: "invalid_payload" });
  });

  it("プロトコルバージョン不一致のjoin/spectateはunsupported_versionで拒否される（03_プロトコル.md）", async () => {
    const code = uniqueRoomCode("mt-unsupported-version");
    const stub = await createRoom(code);

    const joinAttempt = await openSocket(stub);
    const joinRecv = collectMessages(joinAttempt, 1);
    sendMessage(joinAttempt, { v: 999, type: "join", name: "Host", level: 3 });
    const [joinError] = await joinRecv;
    expect(joinError).toMatchObject({ type: "error", code: "unsupported_version" });

    const spectateAttempt = await openSocket(stub);
    const spectateRecv = collectMessages(spectateAttempt, 1);
    sendMessage(spectateAttempt, { v: 999, type: "spectate" });
    const [spectateError] = await spectateRecv;
    expect(spectateError).toMatchObject({ type: "error", code: "unsupported_version" });
  });
});
