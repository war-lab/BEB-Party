// 盤面の送信の間引きと再送（基本設計/12の place）。
//
// 未接続で送れなかった盤面を捨てないことを固定する。E2Eで、再接続の瞬間の操作が
// 黙って消える経路を実際に踏んだためである。
import { emptyBoard, type Board } from "@beb/shared-blindroom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendAction = vi.fn<(action: string, payload?: Record<string, unknown>) => boolean>();

// client-coreはSvelteコンポーネントを含むため、モジュールごと差し替える
vi.mock("@beb/client-core", () => ({ sendAction }));

const { createPlaceSender } = await import("./place-sender");

/** テストは既定の広さ（標準 4×3）で行う。送信の間引きはマス数に依存しない */
const CELL_COUNT = 12;

function boardWith(id: string): Board {
  const board = emptyBoard(CELL_COUNT);
  board[0] = id;
  return board;
}

let clock = 0;
const now = (): number => clock;

beforeEach(() => {
  vi.useFakeTimers();
  clock = 100_000;
  sendAction.mockReset();
  sendAction.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

/** 予約されたタイマーを進める */
function advance(ms: number): void {
  clock += ms;
  vi.advanceTimersByTime(ms);
}

describe("送信の間引き", () => {
  it("連続した操作を1通にまとめる", () => {
    const sender = createPlaceSender(now);
    sender.send(0, boardWith("cat"));
    sender.send(0, boardWith("dog"));
    sender.send(0, boardWith("book"));
    expect(sendAction).not.toHaveBeenCalled();

    advance(500);
    expect(sendAction).toHaveBeenCalledTimes(1);
    // 送るのは常に最後の盤面
    expect(sendAction.mock.calls[0]?.[1]).toEqual({ roundIndex: 0, cells: boardWith("book") });
  });

  it("最短の送信間隔を空ける", () => {
    const sender = createPlaceSender(now);
    sender.send(0, boardWith("cat"));
    advance(500);
    expect(sendAction).toHaveBeenCalledTimes(1);

    sender.send(0, boardWith("dog"));
    advance(600);
    // 直前の送信から1秒たっていないため、まだ送らない
    expect(sendAction).toHaveBeenCalledTimes(1);
    advance(500);
    expect(sendAction).toHaveBeenCalledTimes(2);
  });
});

describe("未接続のときの再送", () => {
  it("送れなかった盤面を捨てず、次の機会に送り直す", () => {
    sendAction.mockReturnValue(false);
    const sender = createPlaceSender(now);
    sender.send(0, boardWith("cat"));

    advance(500);
    expect(sendAction).toHaveBeenCalledTimes(1);

    // 接続が戻る
    sendAction.mockReturnValue(true);
    advance(1000);
    expect(sendAction).toHaveBeenCalledTimes(2);
    expect(sendAction.mock.calls[1]?.[1]).toEqual({ roundIndex: 0, cells: boardWith("cat") });

    // 送れたあとは再送しない
    advance(5000);
    expect(sendAction).toHaveBeenCalledTimes(2);
  });

  it("flushで送れなくても保留が残る", () => {
    sendAction.mockReturnValue(false);
    const sender = createPlaceSender(now);
    sender.send(0, boardWith("cat"));
    sender.flush();
    expect(sendAction).toHaveBeenCalledTimes(1);

    sendAction.mockReturnValue(true);
    advance(1000);
    expect(sendAction).toHaveBeenCalledTimes(2);
  });

  it("disposeは再送を予約しない", () => {
    sendAction.mockReturnValue(false);
    const sender = createPlaceSender(now);
    sender.send(0, boardWith("cat"));
    sender.dispose();
    expect(sendAction).toHaveBeenCalledTimes(1);

    sendAction.mockReturnValue(true);
    advance(5000);
    expect(sendAction).toHaveBeenCalledTimes(1);
  });
});

describe("flush", () => {
  it("保留を待たずに送る（完了申告の追い越しを防ぐ）", () => {
    const sender = createPlaceSender(now);
    sender.send(0, boardWith("cat"));
    sender.flush();
    expect(sendAction).toHaveBeenCalledTimes(1);

    // 予約は消えているため、二重には送らない
    advance(2000);
    expect(sendAction).toHaveBeenCalledTimes(1);
  });

  it("保留が無ければ何も送らない", () => {
    const sender = createPlaceSender(now);
    sender.flush();
    expect(sendAction).not.toHaveBeenCalled();
  });
});
