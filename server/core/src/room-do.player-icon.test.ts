// joinで受け取ったアイコンをstateへ載せる。未指定時の既定値の割り当てもここで担保する。
// このファイルは@beb/shared-coreとスタブGameModuleのみをimportし、実際のゲームモジュールをimportしない。
import { beforeAll, describe, expect, it } from "vitest";
import { isPlayerIconId } from "@beb/shared-core";
import { registry } from "./registry";
import { STUB_GAME_ID, stubGameModule } from "./test-support/stub-game-module";
import { collectMessages, createRoom, openSocket, sendMessage, uniqueRoomCode } from "./test-support/room-do-test-helpers";

beforeAll(() => {
  registry[STUB_GAME_ID] = stubGameModule;
});

describe("RoomDO プレイヤーアイコン", () => {
  it("joinで指定したアイコンがstateに載る", async () => {
    const stub = await createRoom(uniqueRoomCode("icon-given"));
    const host = await openSocket(stub);
    const recv = collectMessages(host, 2); // joined, state
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3, icon: "fox" });
    const [, state] = await recv;

    expect(state).toMatchObject({ players: [{ name: "Host", icon: "fox" }] });
  });

  it("アイコンを送らないjoinにも既定のアイコンを割り当てる（旧SPAのタブ）", async () => {
    const stub = await createRoom(uniqueRoomCode("icon-absent"));
    const host = await openSocket(stub);
    const recv = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3 });
    const [, state] = await recv;

    const players = (state as { players: { icon?: unknown }[] }).players;
    expect(players).toHaveLength(1);
    expect(isPlayerIconId(players[0]?.icon)).toBe(true);
  });

  it("一覧に無いアイコンのjoinはinvalid_payloadで拒否し、席を作らない", async () => {
    const stub = await createRoom(uniqueRoomCode("icon-unknown"));
    const socket = await openSocket(stub);
    const recv = collectMessages(socket, 1);
    sendMessage(socket, { v: 1, type: "join", name: "Host", level: 3, icon: "not-an-icon" });
    const [error] = await recv;

    expect(error).toMatchObject({ type: "error", code: "invalid_payload" });

    // 席が作られていないことを、続く正しいjoinがホストになることで確かめる
    const recvJoin = collectMessages(socket, 2);
    sendMessage(socket, { v: 1, type: "join", name: "Host", level: 3, icon: "cat" });
    const [, state] = await recvJoin;
    expect(state).toMatchObject({ players: [{ name: "Host", icon: "cat", isHost: true }] });
  });

  it("同じアイコンを複数人が選べる（重複はサーバで弾かない）", async () => {
    const stub = await createRoom(uniqueRoomCode("icon-dup"));
    const host = await openSocket(stub);
    const hostRecv = collectMessages(host, 2);
    sendMessage(host, { v: 1, type: "join", name: "Host", level: 3, icon: "cat" });
    await hostRecv;

    const guest = await openSocket(stub);
    const guestRecv = collectMessages(guest, 2);
    sendMessage(guest, { v: 1, type: "join", name: "Guest", level: 2, icon: "cat" });
    const [, state] = await guestRecv;

    expect(state).toMatchObject({
      players: [
        { name: "Host", icon: "cat" },
        { name: "Guest", icon: "cat" },
      ],
    });
  });
});
