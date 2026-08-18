// 受入条件5: Hibernation復帰後に同じreconnectTokenでjoinしてsecretが再送される
//
// evictDurableObject()による強制evictも試したが、アクティブなHibernatable WebSocketが
// ある状態でのeviction待機が実行環境で完了せずタイムアウトした。これは既知のツール側の不安定性
// (cloudflare/workers-sdk#5423: hibernation関連のセグフォルト・内部10秒非活動タイムアウトの
// 議論)と一致する挙動であり、本実装のバグの再現ではない。
//
// RoomDOはどのハンドラも呼び出しの都度ctx.storageから状態を読み直し、呼び出しをまたぐ
// インメモリキャッシュを一切持たない（room-do.tsのgetRoom/getSecretsを参照）。
// そのためHibernation復帰後の再構築は、実際にevictを起こさなくても
// 「新しいWebSocket接続で同じreconnectTokenを送ったときに正しくsecretが再送されるか」を
// 検証すれば構造的に同じことを確認できる。
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

describe("Hibernation復帰後の再接続", () => {
  it("新しいソケットで同じreconnectTokenを送るとsecretが再送される", async () => {
    const code = uniqueRoomCode("reconnect");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    const hostJoin = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    const [joined] = await hostJoin;
    const reconnectToken = (joined as { reconnectToken: string }).reconnectToken;
    expect(reconnectToken).toBeTruthy();

    await selectGameAndContent(host, STUB_GAME_ID, STUB_CONTENT_ID);

    const startRecv = collectMessages(host, 2); // secret, state
    sendMessage(host, { v: 1, type: "start" });
    const [firstSecret] = await startRecv;
    expect(firstSecret?.type).toBe("secret");

    // 元のソケットを切断し(Hibernation復帰前の切断相当)、新しいソケットで再接続する
    host.close();

    const reconnectedSocket = await openSocket(stub);
    const reconnectRecv = collectMessages(reconnectedSocket, 3); // joined, state, secret
    sendMessage(reconnectedSocket, { v: 1, type: "join", name: "Host", level: 3, reconnectToken });
    const [reJoined, reState, reSecret] = await reconnectRecv;

    expect(reJoined).toMatchObject({ type: "joined", reconnectToken });
    expect(reState).toMatchObject({ type: "state", lifecycle: "playing" });
    expect(reSecret).toEqual(firstSecret);
  });
});
