// 受入条件1: stageDeadlineとexpireAtの前後関係4通りで、アラームが正しくディスパッチされる
// 受入条件2: 1人を切断させたまま締切を経過させても次ステージへ遷移する（デッドロック不在）
// 受入条件6: expireAt到達で部屋の全stateが削除される
//
// runDurableObjectAlarm()で「今スケジュールされているアラームを即時発火」させ、
// runInDurableObject()でstorageのroom/alarmsを直接書き換えて時刻の前後関係を作る。
// fake timers(vi.useFakeTimers)はgetWebSocketAutoResponseTimestamp()等workerdの
// 内部時刻を進めないことを実測済みのため、alarmのディスパッチ検証にはこの手段を使う。
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { registry } from "./registry";
import { STUB_GAME_ID, stubGameModule } from "./test-support/stub-game-module";
import {
  collectMessages,
  createRoom,
  getStub,
  openSocket,
  sendMessage,
  uniqueRoomCode,
  upgradeToWebSocket,
} from "./test-support/room-do-test-helpers";

beforeAll(() => {
  registry[STUB_GAME_ID] = stubGameModule;
});

async function setRoomAndAlarms(
  stub: ReturnType<typeof getStub>,
  patch: { deadline?: number },
  alarms: { stageDeadline?: number; expireAt: number },
) {
  await runInDurableObject(stub, async (_instance, state) => {
    const room = await state.storage.get("room");
    await state.storage.put("room", { ...(room as object), ...patch });
    await state.storage.put("alarms", alarms);
  });
}

describe("アラーム多重化", () => {
  it("stageDeadlineが過去・expireAtが未来: onDeadlineによるステージ遷移が起きる", async () => {
    const code = uniqueRoomCode("alarm-deadline-only");
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

    const now = Date.now();
    await setRoomAndAlarms(stub, { deadline: now - 1000 }, { stageDeadline: now - 1000, expireAt: now + 10_000 });

    const stateRecv = collectMessages(host, 1);
    const ran = await runDurableObjectAlarm(stub);
    expect(ran).toBe(true);
    const [state] = await stateRecv;
    expect(state).toMatchObject({ type: "state", stage: "stage2" });
  });

  it("1人を切断させたまま締切を過ぎても次ステージへ遷移する（デッドロック不在）", async () => {
    const code = uniqueRoomCode("alarm-deadlock");
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

    const selectRecv = Promise.all([collectMessages(host, 1), collectMessages(guest, 1)]);
    sendMessage(host, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    await selectRecv;
    const startRecv = Promise.all([collectMessages(host, 2), collectMessages(guest, 2)]);
    sendMessage(host, { v: 1, type: "start" });
    await startRecv;

    // guestを切断したまま締切を経過させる
    guest.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const now = Date.now();
    await setRoomAndAlarms(stub, { deadline: now - 1000 }, { stageDeadline: now - 1000, expireAt: now + 10_000 });

    const stateRecv = collectMessages(host, 1);
    await runDurableObjectAlarm(stub);
    const [state] = await stateRecv;
    expect(state).toMatchObject({ type: "state", stage: "stage2" });
  });

  it("stageDeadlineが未来・expireAtが過去: 部屋が破棄される", async () => {
    const code = uniqueRoomCode("alarm-expire-only");
    const stub = await createRoom(code);
    const now = Date.now();
    await setRoomAndAlarms(stub, {}, { stageDeadline: now + 60_000, expireAt: now - 1000 });

    await runDurableObjectAlarm(stub);

    const response = await upgradeToWebSocket(getStub(code));
    expect(response.status).toBe(404);
  });

  it("stageDeadline・expireAtとも過去: expireAtが優先され部屋が破棄される", async () => {
    const code = uniqueRoomCode("alarm-both-past");
    const stub = await createRoom(code);
    const now = Date.now();
    await setRoomAndAlarms(stub, { deadline: now - 1000 }, { stageDeadline: now - 1000, expireAt: now - 500 });

    await runDurableObjectAlarm(stub);

    const response = await upgradeToWebSocket(getStub(code));
    expect(response.status).toBe(404);
  });

  it("stageDeadline・expireAtとも未来: 何も起きない", async () => {
    const code = uniqueRoomCode("alarm-both-future");
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

    const now = Date.now();
    await setRoomAndAlarms(stub, { deadline: now + 60_000 }, { stageDeadline: now + 60_000, expireAt: now + 120_000 });

    await runDurableObjectAlarm(stub);

    // 状態が変わっていないことを、副作用の無いspectateの読み取りで確認する
    const spectator = await openSocket(stub);
    const spectateRecv = collectMessages(spectator, 1);
    sendMessage(spectator, { v: 1, type: "spectate" });
    const [state] = await spectateRecv;
    expect(state).toMatchObject({ stage: "stage1", lifecycle: "playing" });
  });

  it("expireAt到達で部屋の全stateが削除され、同じコードで再度initできる", async () => {
    const code = uniqueRoomCode("alarm-destroy-all");
    const stub = await createRoom(code);
    const now = Date.now();
    await setRoomAndAlarms(stub, {}, { expireAt: now - 1000 });

    await runDurableObjectAlarm(stub);

    const keysAfter = await runInDurableObject(stub, async (_instance, state) => {
      const all = await state.storage.list();
      return [...all.keys()];
    });
    expect(keysAfter).toEqual([]);

    // 全stateが消えていれば、同じ部屋コードで再度initできる
    const reinitResponse = await getStub(code).fetch("https://room-do/init", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    expect(reinitResponse.ok).toBe(true);
  });
});
