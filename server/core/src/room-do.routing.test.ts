// 受入条件8: 未初期化のコードへのWSアップグレードが、確立前にroom_not_foundで拒否される
import { describe, expect, it } from "vitest";
import { getStub, uniqueRoomCode, upgradeToWebSocket } from "./test-support/room-do-test-helpers";

describe("未初期化の部屋へのWebSocketアップグレード", () => {
  it("initを送っていないコードへのアップグレードは101にならず、room_not_foundを返す", async () => {
    const code = uniqueRoomCode("uninitialized");
    const stub = getStub(code); // createRoom(=/init)を呼ばない

    const response = await upgradeToWebSocket(stub);

    expect(response.status).toBe(404);
    expect(response.webSocket).toBeNull();
    const body = await response.json();
    expect(body).toMatchObject({ error: "room_not_found" });
  });
});
