// 切断とブロードキャストの宛先。
// 1) join/spectateを送っていないソケットはまだ部屋の参加者ではないため、stateを配らない
// 2) 再接続で新しいソケットに切り替わったあと、遅れて届く古いソケットのcloseで
//    connected: falseにしない（再接続テストの間欠失敗の原因）
import { beforeAll, describe, expect, it } from "vitest";
import type { ServerMessage } from "@beb/shared-core";
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

function record(ws: WebSocket): ServerMessage[] {
  const received: ServerMessage[] = [];
  ws.addEventListener("message", (event: MessageEvent) => {
    const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
    received.push(JSON.parse(raw) as ServerMessage);
  });
  return received;
}

async function joinPlayer(ws: WebSocket, name: string): Promise<string> {
  const recv = collectMessages(ws, 2); // joined, state
  sendMessage(ws, { v: 1, type: "join", name, level: 3 });
  const [joined] = await recv;
  return (joined as { reconnectToken: string }).reconnectToken;
}

describe("ブロードキャストの宛先", () => {
  it("joinもspectateも送っていないソケットにはstateを配らない", async () => {
    const code = uniqueRoomCode("silent-socket");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    await joinPlayer(host, "Host");

    // 接続しただけで何も送っていないソケット
    const idle = await openSocket(stub);
    const idleMessages = record(idle);

    // 別プレイヤーのjoinでstateがブロードキャストされる
    const hostRecv = collectMessages(host, 1);
    const guest = await openSocket(stub);
    await joinPlayer(guest, "Guest");
    await hostRecv; // ホストへは届いた = ブロードキャストは実行済み

    expect(idleMessages).toEqual([]);
  });
});

describe("切断の扱い", () => {
  it("唯一のソケットが閉じたプレイヤーはconnected: falseになる", async () => {
    const code = uniqueRoomCode("close-marks-offline");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    await joinPlayer(host, "Host");
    const guest = await openSocket(stub);
    await joinPlayer(guest, "Guest");

    const hostRecv = collectMessages(host, 1);
    guest.close();
    const [state] = await hostRecv;

    const players = (state as { players: { name: string; connected: boolean }[] }).players;
    expect(players.find((player) => player.name === "Guest")?.connected).toBe(false);
  });

  it("再接続すると同じ席の古いソケットはサーバ側から閉じられる", async () => {
    const code = uniqueRoomCode("close-superseded");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    const token = await joinPlayer(host, "Host");

    // 古いソケットが閉じられるのを待つ。残ると死活判定が古い方の無応答を見て
    // 復帰済みのプレイヤーをconnected: falseにする
    const oldClosed = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("古いソケットが閉じられなかった")), 5000);
      host.addEventListener("close", (event: CloseEvent) => {
        clearTimeout(timer);
        resolve(event.code);
      });
    });

    const revived = await openSocket(stub);
    const revivedRecv = collectMessages(revived, 2); // joined, state
    sendMessage(revived, { v: 1, type: "join", name: "Host", level: 3, reconnectToken: token });
    await revivedRecv;

    expect(await oldClosed).toBe(1000);
  });

  it("再接続後に遅れて届く古いソケットのcloseでconnected: falseにしない", async () => {
    const code = uniqueRoomCode("stale-close");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    const token = await joinPlayer(host, "Host");
    const guest = await openSocket(stub);
    await joinPlayer(guest, "Guest");

    // 新しいソケットで再接続してから、古いソケットを閉じる
    const revived = await openSocket(stub);
    const revivedRecv = collectMessages(revived, 2); // joined, state
    sendMessage(revived, { v: 1, type: "join", name: "Host", level: 3, reconnectToken: token });
    await revivedRecv;

    const strayMessages = record(revived);
    host.close();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 古いソケットのcloseは無視されるため、stateのブロードキャスト自体が起きない
    expect(strayMessages).toEqual([]);

    // 現在の状態でもホストは接続中のままである
    const guestRecv = collectMessages(guest, 1);
    const late = await openSocket(stub);
    await joinPlayer(late, "Late");
    const [state] = await guestRecv;
    const players = (state as { players: { name: string; connected: boolean }[] }).players;
    expect(players.find((player) => player.name === "Host")?.connected).toBe(true);
  });
});

describe("開示の再送", () => {
  it("finished中に再接続したプレイヤーと観戦ソケットへresultを再送する", async () => {
    const code = uniqueRoomCode("result-resend");
    const stub = await createRoom(code);

    const host = await openSocket(stub);
    const token = await joinPlayer(host, "Host");
    await selectGameAndContent(host, STUB_GAME_ID, STUB_CONTENT_ID);

    const startRecv = collectMessages(host, 2); // secret, state
    sendMessage(host, { v: 1, type: "start" });
    await startRecv;

    const advanceRecv = collectMessages(host, 1);
    sendMessage(host, { v: 1, type: "action", action: "advance" });
    await advanceRecv;

    const finishRecv = collectMessages(host, 2); // state, result
    sendMessage(host, { v: 1, type: "action", action: "finish" });
    const [, firstResult] = await finishRecv;
    expect(firstResult).toMatchObject({ type: "result" });

    // 開示中に切断し、新しいソケットで戻る
    const revived = await openSocket(stub);
    const revivedRecv = collectMessages(revived, 4); // joined, state, secret, result
    sendMessage(revived, { v: 1, type: "join", name: "Host", level: 3, reconnectToken: token });
    const revivedMessages = await revivedRecv;
    expect(revivedMessages[3]).toEqual(firstResult);

    // 表示端末を切り替えたホスト画面（観戦ソケット）にも届く
    const spectator = await openSocket(stub);
    const spectateRecv = collectMessages(spectator, 2); // state, result
    sendMessage(spectator, { v: 1, type: "spectate" });
    const [, spectatorResult] = await spectateRecv;
    expect(spectatorResult).toEqual(firstResult);
  });
});
