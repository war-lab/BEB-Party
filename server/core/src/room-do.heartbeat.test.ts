// 受入条件7: 登録した固定文字列と一致するハートビートが、DOのメッセージハンドラを起こさない
// 受入条件5: ハートビートを止めたソケットが、90秒経過後の任意のメッセージ受信を契機にconnected: falseになる
//
// 条件5はfake timersでは検証できない(getWebSocketAutoResponseTimestamp()はworkerd内部の
// 実時刻を参照しており、vi.useFakeTimers()で進まないことを実測済み)。ADR-0013が指示する通り
// 「時刻を進めてから任意のメッセージを送り、その時点でconnected: falseになることを確認する」
// ため、実際に90秒待つ。CIでは低速だが、死活判定の正しさを担保するために実時間を使う。
import { HEARTBEAT_PING, HEARTBEAT_PONG } from "@beb/shared-core";
import { describe, expect, it } from "vitest";
import { collectMessages, createRoom, openSocket, sendMessage, uniqueRoomCode } from "./test-support/room-do-test-helpers";

describe("ハートビート", () => {
  it("登録した固定文字列に一致するpingは自動応答のみで、DOのメッセージハンドラを起こさない", async () => {
    const code = uniqueRoomCode("heartbeat-auto-response");
    const stub = await createRoom(code);
    const ws = await openSocket(stub);

    const messages: string[] = [];
    ws.addEventListener("message", (event) => {
      messages.push(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer));
    });

    ws.send(HEARTBEAT_PING);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 自動応答のpongのみが返り、ハンドラ経由のerror(invalid_payload)等は発生しない
    expect(messages).toEqual([HEARTBEAT_PONG]);
  });

  it(
    "ハートビートを止めたソケットは、90秒経過後の任意のメッセージ受信を契機にconnected: falseになる",
    async () => {
      const code = uniqueRoomCode("heartbeat-dead");
      const stub = await createRoom(code);
      const host = await openSocket(stub);
      const hostJoin = collectMessages(host, 2);
      sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
      await hostJoin;

      // ハートビートを送らないまま90秒待つ(実時間)
      await new Promise((resolve) => setTimeout(resolve, 91_000));

      // 「任意のメッセージ受信」を契機に死活判定が走る。ここではspectateで新規接続する
      const spectator = await openSocket(stub);
      const spectateRecv = collectMessages(spectator, 1);
      const hostRecv = collectMessages(host, 1); // 死活判定によるstate再配信
      sendMessage(spectator, { v: 1, type: "spectate" });
      const [state] = await spectateRecv;
      await hostRecv;

      expect((state as { players: { connected: boolean }[] }).players[0]?.connected).toBe(false);
    },
    100_000,
  );
});
