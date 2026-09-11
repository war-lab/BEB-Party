// 完了申告と盤面の送信順（基本設計/12の done）。
//
// PR #31のレビュー指摘と、その修正で作った穴（置き直した後の自動申告）の両方を固定する。
// 元の指摘: 再接続で送り直すとき、盤面を送らずに done だけを送っていた。
// 切断中に置いて申告すると、古い盤面で完了扱いになる（最後の聞き手ならそのまま採点が確定する）。
import { emptyBoard, type Board } from "@beb/shared-blindroom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendAction = vi.fn<(action: string, payload?: Record<string, unknown>) => boolean>();

vi.mock("@beb/client-core", () => ({ sendAction }));

const { createPlaceSender } = await import("./place-sender");
const { createBoardSender } = await import("./board-sender");

/** テストは既定の広さ（標準 4×3）で行う。送信の間引きはマス数に依存しない */
const CELL_COUNT = 12;

function boardWith(id: string): Board {
  const board = emptyBoard(CELL_COUNT);
  board[0] = id;
  return board;
}

/** 送信されたactionの並び */
function actions(): string[] {
  return sendAction.mock.calls.map((call) => call[0]);
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

describe("押したとき", () => {
  it("保留の盤面を送ってから申告する", () => {
    const place = createPlaceSender(now);
    const done = createBoardSender(place);

    done.place(0, boardWith("cat"));
    done.declare(0, true);

    expect(actions()).toEqual(["place", "done"]);
    expect(sendAction.mock.calls[0]?.[1]).toEqual({ roundIndex: 0, cells: boardWith("cat") });
    expect(sendAction.mock.calls[1]?.[1]).toEqual({ done: true });
  });

  it("保留が無ければ申告だけを送る", () => {
    const place = createPlaceSender(now);
    const done = createBoardSender(place);

    done.declare(0, true);

    expect(actions()).toEqual(["done"]);
  });
});

describe("再接続で送り直すとき", () => {
  it("盤面を先に送る（doneが古い盤面を追い越さない）", () => {
    // 切断中: 置いて申告する。どちらも送れない
    sendAction.mockReturnValue(false);
    const place = createPlaceSender(now);
    const done = createBoardSender(place);

    done.place(0, boardWith("cat"));
    done.declare(0, true);
    expect(actions()).toEqual(["place", "done"]);

    // 接続が戻る。サーバはまだ未申告（serverDone=false）
    sendAction.mockReset();
    sendAction.mockReturnValue(true);
    done.resend(0, false);

    expect(actions()).toEqual(["place", "done"]);
    expect(sendAction.mock.calls[0]?.[1]).toEqual({ roundIndex: 0, cells: boardWith("cat") });
  });

  it("サーバの状態と一致していれば送らない", () => {
    const place = createPlaceSender(now);
    const done = createBoardSender(place);
    done.declare(0, true);
    sendAction.mockReset();

    done.resend(0, true);
    expect(actions()).toEqual([]);
  });

  it("ラウンドが変わっていれば送らない", () => {
    const place = createPlaceSender(now);
    const done = createBoardSender(place);
    done.declare(0, true);
    sendAction.mockReset();

    done.resend(1, false);
    expect(actions()).toEqual([]);
  });

  it("盤面を触った後は送り直さない（サーバの取り消しを送信欠落と取り違えない）", () => {
    const place = createPlaceSender(now);
    const done = createBoardSender(place);
    done.declare(0, true);
    // 置き直す。サーバは place の受理時に done を取り消す
    done.place(0, boardWith("dog"));
    sendAction.mockReset();

    // 再接続。サーバは未申告（false）だが、本人は押し直していない
    done.resend(0, false);
    expect(actions()).toEqual([]);
  });

  it("申告していなければ送らない", () => {
    const place = createPlaceSender(now);
    const done = createBoardSender(place);

    done.resend(0, false);
    expect(actions()).toEqual([]);
  });

  it("取り消しも同じ経路で送り直す", () => {
    const place = createPlaceSender(now);
    const done = createBoardSender(place);
    done.declare(0, false);
    sendAction.mockReset();

    done.resend(0, true);
    expect(actions()).toEqual(["done"]);
    expect(sendAction.mock.calls[0]?.[1]).toEqual({ done: false });
  });
});
