// 受入条件3: プレイヤーAがBのplayerIdをreconnectTokenとしてjoinすると失敗し、Bのsecretが送られない（ADR-0006）
// 受入条件4: 全ステージを通し、secret以外の受信メッセージにreconnectToken・スタブの秘密状態が含まれない（ADR-0003）
import { beforeAll, describe, expect, it } from "vitest";
import { registry } from "./registry";
import { STUB_GAME_ID, stubGameModule } from "./test-support/stub-game-module";
import { collectMessages, createRoom, openSocket, sendMessage, uniqueRoomCode } from "./test-support/room-do-test-helpers";

beforeAll(() => {
  registry[STUB_GAME_ID] = stubGameModule;
});

describe("秘密情報の分離", () => {
  it("BのplayerIdをreconnectTokenとしてjoinしてもBのsecretは奪えない", async () => {
    const code = uniqueRoomCode("impersonation");
    const stub = await createRoom(code);

    const hostA = await openSocket(stub);
    const aJoin = collectMessages(hostA, 2);
    sendMessage(hostA, { v: 1, type: "join", name: "Alice", level: 3 });
    await aJoin;

    const hostB = await openSocket(stub);
    const bJoin = collectMessages(hostB, 2);
    const aRecvBJoin = collectMessages(hostA, 1);
    sendMessage(hostB, { v: 1, type: "join", name: "Bob", level: 2 });
    const [, bState] = await bJoin;
    await aRecvBJoin;
    const bPlayerId = (bState as { players: { id: string; name: string }[] }).players.find(
      (p) => p.name === "Bob",
    )?.id;
    expect(bPlayerId).toBeTruthy();

    // ゲームを開始し、playing中にする(ロビー中は照合失敗が新規参加として扱われ「失敗」の意味が薄いため)
    const selectRecv = Promise.all([collectMessages(hostA, 1), collectMessages(hostB, 1)]);
    sendMessage(hostA, { v: 1, type: "selectGame", gameId: STUB_GAME_ID });
    await selectRecv;
    const startRecv = Promise.all([collectMessages(hostA, 2), collectMessages(hostB, 2)]);
    sendMessage(hostA, { v: 1, type: "start" });
    await startRecv;

    // なりすまし試行: BのplayerId(公開値)をreconnectTokenとしてjoin
    const attacker = await openSocket(stub);
    const attackerRecv = collectMessages(attacker, 1);
    sendMessage(attacker, { v: 1, type: "join", name: "Attacker", level: 1, reconnectToken: bPlayerId });
    const [error] = await attackerRecv;
    expect(error).toMatchObject({ type: "error", code: "game_in_progress" });

    // 攻撃者にsecretが届いていないことを、追加でメッセージが来ないことで確認する(タイムアウトで失敗させる代わりに一定時間待つ)
    let secretArrived = false;
    attacker.addEventListener("message", () => {
      secretArrived = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(secretArrived).toBe(false);
  });

  it("全ステージを通し、stateにreconnectTokenとスタブの秘密フィールドが含まれない", async () => {
    const code = uniqueRoomCode("no-leak");
    const stub = await createRoom(code);
    const host = await openSocket(stub);

    const seenStates: unknown[] = [];
    host.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
      const message = JSON.parse(raw);
      if (message.type === "state") {
        seenStates.push(message);
      }
    });

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

    const finishRecv = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "action", action: "finish" });
    await finishRecv;

    expect(seenStates.length).toBeGreaterThan(0);
    for (const state of seenStates) {
      const serialized = JSON.stringify(state);
      expect(serialized).not.toContain("reconnectToken");
      // スタブGameModuleのsecret固有フィールド(hint)がstateに混入していないこと
      expect(serialized).not.toContain("hint");
    }
  });
});
