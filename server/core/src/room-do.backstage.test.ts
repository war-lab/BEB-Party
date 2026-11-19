// 裏画面とペアの指定（ADR-0035、基本設計/01の「裏画面のソケット」）。
// 指定が参加者や観戦ソケットへ漏れること、不正な組が保存されること、kick・nextGame・startでの扱いの退行を検出する
import { runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { GameModule, PinnedPair, ServerMessage } from "@beb/shared-core";
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

// startに渡ったペアの指定を記録するゲーム。スタブの動作はそのままで、入力だけを覗く
const CAPTURE_GAME_ID = "capture-game";
const capturedPinnedPairs: PinnedPair[][] = [];
const captureModule: GameModule<unknown, unknown, unknown, unknown> = {
  ...(stubGameModule as unknown as GameModule<unknown, unknown, unknown, unknown>),
  acceptsPinnedPairs: true,
  start: (input) => {
    capturedPinnedPairs.push(input.pinnedPairs ?? []);
    return (stubGameModule as unknown as GameModule<unknown, unknown, unknown, unknown>).start(input);
  },
};

beforeAll(() => {
  registry[STUB_GAME_ID] = stubGameModule;
  registry[CAPTURE_GAME_ID] = captureModule;
});

function parse(event: MessageEvent): { raw: string; message: ServerMessage } {
  const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
  return { raw, message: JSON.parse(raw) as ServerMessage };
}

/** ソケットが受け取った全メッセージを生の文字列のまま記録する。漏れの検査に使う */
function record(ws: WebSocket): string[] {
  const raws: string[] = [];
  ws.addEventListener("message", (event) => raws.push(parse(event).raw));
  return raws;
}

/** 条件を満たすメッセージが届くまで待つ。stateのブロードキャストの回数に依存しないため */
function waitFor(ws: WebSocket, predicate: (message: ServerMessage) => boolean, timeoutMs = 5000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
    const handler = (event: MessageEvent) => {
      const { message } = parse(event);
      if (predicate(message)) {
        clearTimeout(timeout);
        ws.removeEventListener("message", handler);
        resolve(message);
      }
    };
    ws.addEventListener("message", handler);
  });
}

const isPinned = (message: ServerMessage): boolean => message.type === "pinnedPairs";

async function join(stub: Awaited<ReturnType<typeof createRoom>>, name: string): Promise<{ ws: WebSocket; id: string }> {
  const ws = await openSocket(stub);
  const joined = waitFor(ws, (message) => message.type === "joined");
  sendMessage(ws, { v: 1, type: "join", name, level: 3 });
  const message = await joined;
  if (message.type !== "joined") {
    throw new Error("unreachable");
  }
  return { ws, id: message.playerId };
}

async function openBackstage(stub: Awaited<ReturnType<typeof createRoom>>): Promise<{ ws: WebSocket; first: ServerMessage[] }> {
  const ws = await openSocket(stub);
  const first = collectMessages(ws, 2);
  sendMessage(ws, { v: 1, type: "backstage" });
  return { ws, first: await first };
}

describe("裏画面のソケット", () => {
  it("backstageの受理でstate→pinnedPairsの順に届き、参加者に数えない", async () => {
    const stub = await createRoom(uniqueRoomCode("backstage-enter"));
    await join(stub, "Host");

    const { first } = await openBackstage(stub);
    expect(first[0]).toMatchObject({ type: "state" });
    expect(first[1]).toEqual({ v: 1, type: "pinnedPairs", pairs: [] });
    const state = first[0] as Extract<ServerMessage, { type: "state" }>;
    expect(state.players).toHaveLength(1);
  });

  it("指定は裏画面にだけ届き、参加者と観戦ソケットのどのメッセージにも含まれない", async () => {
    const stub = await createRoom(uniqueRoomCode("backstage-secrecy"));
    const host = await join(stub, "Host");
    const hostRaws = record(host.ws);
    const p2 = await join(stub, "P2");
    const p2Raws = record(p2.ws);
    const p3 = await join(stub, "P3");
    const p4 = await join(stub, "P4");
    const spectator = await openSocket(stub);
    const spectatorRaws = record(spectator);
    sendMessage(spectator, { v: 1, type: "spectate" });

    const { ws: backstage } = await openBackstage(stub);
    const updated = waitFor(backstage, isPinned);
    sendMessage(backstage, { v: 1, type: "setPinnedPairs", pairs: [[host.id, p3.id]] });
    expect(await updated).toEqual({ v: 1, type: "pinnedPairs", pairs: [[host.id, p3.id]] });

    // 開始まで進め、secretとstateが配られた後も漏れていないことを確かめる
    await selectGameAndContent(host.ws, CAPTURE_GAME_ID, STUB_CONTENT_ID);
    const started = waitFor(p4.ws, (message) => message.type === "secret");
    sendMessage(host.ws, { v: 1, type: "start" });
    await started;

    for (const raws of [hostRaws, p2Raws, spectatorRaws]) {
      expect(raws.length).toBeGreaterThan(0);
      for (const raw of raws) {
        expect(raw).not.toContain("pinnedPairs");
        expect(raw).not.toContain("pinned");
      }
    }
  });

  it("参加者と観戦ソケットからのsetPinnedPairsはinvalid_lifecycleで拒否する", async () => {
    const stub = await createRoom(uniqueRoomCode("backstage-sender"));
    const host = await join(stub, "Host");
    const p2 = await join(stub, "P2");

    const rejected = waitFor(host.ws, (message) => message.type === "error");
    sendMessage(host.ws, { v: 1, type: "setPinnedPairs", pairs: [[host.id, p2.id]] });
    expect(await rejected).toMatchObject({ type: "error", code: "invalid_lifecycle" });

    const spectator = await openSocket(stub);
    const spectateRecv = collectMessages(spectator, 1);
    sendMessage(spectator, { v: 1, type: "spectate" });
    await spectateRecv;
    const spectatorRejected = waitFor(spectator, (message) => message.type === "error");
    sendMessage(spectator, { v: 1, type: "setPinnedPairs", pairs: [[host.id, p2.id]] });
    expect(await spectatorRejected).toMatchObject({ type: "error", code: "invalid_lifecycle" });

    // 保存されていない
    const { first } = await openBackstage(stub);
    expect(first[1]).toEqual({ v: 1, type: "pinnedPairs", pairs: [] });
  });

  it("参加者でない人を含む組・同じ人の組・人を共有する組はinvalid_payloadで拒否し、保存しない", async () => {
    const stub = await createRoom(uniqueRoomCode("backstage-invalid"));
    const host = await join(stub, "Host");
    const p2 = await join(stub, "P2");
    const p3 = await join(stub, "P3");
    const { ws: backstage } = await openBackstage(stub);

    const cases: unknown[] = [
      [[host.id, "not-a-player"]],
      [[host.id, host.id]],
      [
        [host.id, p2.id],
        [p2.id, p3.id],
      ],
    ];
    for (const pairs of cases) {
      const rejected = waitFor(backstage, (message) => message.type === "error");
      sendMessage(backstage, { v: 1, type: "setPinnedPairs", pairs });
      expect(await rejected).toMatchObject({ type: "error", code: "invalid_payload" });
    }

    const { first } = await openBackstage(stub);
    expect(first[1]).toEqual({ v: 1, type: "pinnedPairs", pairs: [] });
  });

  it("kickで外した人を含む組を消し、裏画面へ知らせる", async () => {
    const stub = await createRoom(uniqueRoomCode("backstage-kick"));
    const host = await join(stub, "Host");
    const p2 = await join(stub, "P2");
    const p3 = await join(stub, "P3");
    const p4 = await join(stub, "P4");
    const { ws: backstage } = await openBackstage(stub);

    const set = waitFor(backstage, isPinned);
    sendMessage(backstage, {
      v: 1,
      type: "setPinnedPairs",
      pairs: [
        [host.id, p2.id],
        [p3.id, p4.id],
      ],
    });
    await set;

    // P4を切断させてから外す（kickは切断中の人だけが対象。ADR-0028）
    const disconnected = waitFor(host.ws, (message) => {
      return message.type === "state" && message.players.some((p) => p.id === p4.id && !p.connected);
    });
    p4.ws.close();
    await disconnected;

    const pruned = waitFor(backstage, isPinned);
    sendMessage(host.ws, { v: 1, type: "kick", playerId: p4.id });
    expect(await pruned).toEqual({ v: 1, type: "pinnedPairs", pairs: [[host.id, p2.id]] });
  });

  it("startへ指定を渡し、nextGameの後も指定を残す", async () => {
    const stub = await createRoom(uniqueRoomCode("backstage-start"));
    const host = await join(stub, "Host");
    const p2 = await join(stub, "P2");
    const p3 = await join(stub, "P3");
    const p4 = await join(stub, "P4");
    const { ws: backstage } = await openBackstage(stub);

    const pairs = [
      [host.id, p4.id],
      [p2.id, p3.id],
    ];
    const set = waitFor(backstage, isPinned);
    sendMessage(backstage, { v: 1, type: "setPinnedPairs", pairs });
    await set;

    capturedPinnedPairs.length = 0;
    await selectGameAndContent(host.ws, CAPTURE_GAME_ID, STUB_CONTENT_ID);
    const playing = waitFor(host.ws, (message) => message.type === "state" && message.lifecycle === "playing");
    sendMessage(host.ws, { v: 1, type: "start" });
    await playing;
    expect(capturedPinnedPairs).toEqual([pairs]);

    // スタブを終局まで進めてロビーへ戻す
    const stage2 = waitFor(host.ws, (message) => message.type === "state" && message.stage === "stage2");
    sendMessage(host.ws, { v: 1, type: "action", action: "advance" });
    await stage2;
    const finished = waitFor(host.ws, (message) => message.type === "result");
    sendMessage(host.ws, { v: 1, type: "action", action: "finish" });
    await finished;
    const lobby = waitFor(host.ws, (message) => message.type === "state" && message.lifecycle === "lobby");
    sendMessage(host.ws, { v: 1, type: "nextGame" });
    await lobby;

    const { first } = await openBackstage(stub);
    expect(first[1]).toEqual({ v: 1, type: "pinnedPairs", pairs });
  });

  it("3本目が来たら一番古い裏画面をbackstage_replacedで閉じる（後勝ち）", async () => {
    const stub = await createRoom(uniqueRoomCode("backstage-replace"));
    const first = await openBackstage(stub);
    await openBackstage(stub);

    const replaced = waitFor(first.ws, (message) => message.type === "error");
    const closed = new Promise<void>((resolve) => first.ws.addEventListener("close", () => resolve()));
    const third = await openBackstage(stub);
    expect(third.first[1]).toEqual({ v: 1, type: "pinnedPairs", pairs: [] });
    expect(await replaced).toMatchObject({ type: "error", code: "backstage_replaced" });
    await closed;
  });

  it("setPinnedPairsはステージの締切のアラームを張り直さない", async () => {
    const stub = await createRoom(uniqueRoomCode("backstage-alarm"));
    const host = await join(stub, "Host");
    await selectGameAndContent(host.ws, STUB_GAME_ID, STUB_CONTENT_ID);
    const playing = waitFor(host.ws, (message) => message.type === "state" && message.lifecycle === "playing");
    sendMessage(host.ws, { v: 1, type: "start" });
    await playing;
    const { ws: backstage } = await openBackstage(stub);

    // 締切が過ぎたのにアラームがまだ動いていない状況を作る（アラームの時刻は未来のまま、締切だけ過去にする）
    const past = Date.now() - 1000;
    const before = await runInDurableObject(stub, async (_instance, state) => {
      const room = (await state.storage.get("room")) as Record<string, unknown>;
      await state.storage.put("room", { ...room, deadline: past });
      const alarms = { stageDeadline: past, expireAt: Date.now() + 60_000 };
      await state.storage.put("alarms", alarms);
      return alarms;
    });

    const set = waitFor(backstage, isPinned);
    sendMessage(backstage, { v: 1, type: "setPinnedPairs", pairs: [] });
    await set;

    const after = await runInDurableObject(stub, async (_instance, state) => state.storage.get("alarms"));
    expect(after).toEqual(before);
  });

  it("参加者のソケットから裏画面へ転向できない", async () => {
    const stub = await createRoom(uniqueRoomCode("backstage-convert"));
    const host = await join(stub, "Host");
    const rejected = waitFor(host.ws, (message) => message.type === "error");
    sendMessage(host.ws, { v: 1, type: "backstage" });
    expect(await rejected).toMatchObject({ type: "error", code: "invalid_lifecycle" });
  });
});

describe("カタログ", () => {
  it("acceptsPinnedPairsを宣言したゲームだけがtrueになる", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/api/catalog"));
    const body = (await response.json()) as { games: { id: string; acceptsPinnedPairs: boolean }[] };
    expect(body.games.find((game) => game.id === CAPTURE_GAME_ID)?.acceptsPinnedPairs).toBe(true);
    expect(body.games.find((game) => game.id === STUB_GAME_ID)?.acceptsPinnedPairs).toBe(false);
  });
});
