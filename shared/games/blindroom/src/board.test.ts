import { createRandom } from "@beb/shared-core";
import { describe, expect, it } from "vitest";
import { BOARD_SIZES, cellCountOf } from "./board-size";
import {
  PLACE_COUNT,
  countMatches,
  emptyBoard,
  generateSample,
  hasDuplicateItem,
  isBoard,
  placedCount,
  placedItemIds,
  type Board,
} from "./board";

const POOL = ["cat", "book", "car", "tree", "star", "key", "cup", "fish"];

/** 3×3。広さに依存しない性質はこの広さで確かめる */
const CELL_COUNT = 9;

describe("emptyBoard", () => {
  it("9マスすべてが空である", () => {
    const board = emptyBoard(CELL_COUNT);
    expect(board).toHaveLength(CELL_COUNT);
    expect(board.every((cell) => cell === null)).toBe(true);
  });
});

describe("isBoard", () => {
  it("9要素の文字列とnullの配列だけを受理する", () => {
    expect(isBoard(emptyBoard(CELL_COUNT), CELL_COUNT)).toBe(true);
    expect(isBoard(["cat", null, null, null, null, null, null, null, null], CELL_COUNT)).toBe(true);
  });

  it("要素数違い・型違い・配列でない値を落とす", () => {
    expect(isBoard([null, null], CELL_COUNT)).toBe(false);
    expect(isBoard([...emptyBoard(CELL_COUNT), null], CELL_COUNT)).toBe(false);
    expect(isBoard([1, null, null, null, null, null, null, null, null], CELL_COUNT)).toBe(false);
    expect(isBoard("cat", CELL_COUNT)).toBe(false);
    expect(isBoard(null, CELL_COUNT)).toBe(false);
  });

  it("広さが違えば同じ盤面でも受理しない", () => {
    expect(isBoard(emptyBoard(9), 12)).toBe(false);
    expect(isBoard(emptyBoard(12), 12)).toBe(true);
  });
});

describe("placedCount / hasDuplicateItem / placedItemIds", () => {
  it("置かれたアイテムだけを数える", () => {
    const board: Board = ["cat", null, "book", null, null, null, null, null, null];
    expect(placedCount(board)).toBe(2);
    expect(hasDuplicateItem(board)).toBe(false);
    expect(placedItemIds(board)).toEqual(["cat", "book"]);
  });

  it("同じアイテムが2マスにあると重複と判定する", () => {
    const board: Board = ["cat", null, "cat", null, null, null, null, null, null];
    expect(hasDuplicateItem(board)).toBe(true);
  });
});

describe("countMatches", () => {
  const sample: Board = ["cat", null, "book", null, "car", null, null, null, null];

  it("見本と同じマスに同じアイテムがある数を返す", () => {
    const board: Board = ["cat", null, "book", null, null, null, null, null, null];
    expect(countMatches(sample, board)).toBe(2);
  });

  it("見本が空白のマスは採点しない（置いても置かなくても点が動かない）", () => {
    const untouched: Board = ["cat", null, null, null, null, null, null, null, null];
    const filled: Board = ["cat", "star", null, "star", null, "star", "star", "star", "star"];
    expect(countMatches(sample, untouched)).toBe(1);
    expect(countMatches(sample, filled)).toBe(1);
  });

  it("空の盤面は0点になる", () => {
    expect(countMatches(sample, emptyBoard(CELL_COUNT))).toBe(0);
  });

  it("違うアイテムを同じマスに置いても加点されない", () => {
    const board: Board = ["book", null, "cat", null, null, null, null, null, null];
    expect(countMatches(sample, board)).toBe(0);
  });
});

describe("generateSample", () => {
  it("アイテムがちょうどPLACE_COUNT個で、重複がなく、すべてが母集団に含まれる", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const board = generateSample(POOL, createRandom(seed), CELL_COUNT);
      expect(board).toHaveLength(CELL_COUNT);
      expect(placedCount(board)).toBe(PLACE_COUNT);
      expect(hasDuplicateItem(board)).toBe(false);
      expect(placedItemIds(board).every((id) => POOL.includes(id))).toBe(true);
    }
  });

  it("同じseedから同じ見本が得られる", () => {
    expect(generateSample(POOL, createRandom(12345), CELL_COUNT)).toEqual(
      generateSample(POOL, createRandom(12345), CELL_COUNT),
    );
  });

  it("seedが違えば見本が変わる（50通りで同一が支配的にならない）", () => {
    const seen = new Set(
      Array.from({ length: 50 }, (_, seed) => JSON.stringify(generateSample(POOL, createRandom(seed), CELL_COUNT))),
    );
    expect(seen.size).toBeGreaterThan(40);
  });

  it("母集団がPLACE_COUNT未満なら、その件数だけ置く", () => {
    const board = generateSample(["cat", "book"], createRandom(1), CELL_COUNT);
    expect(placedCount(board)).toBe(2);
  });
});

describe("広さを変えたときの生成", () => {
  it("どの広さでもPLACE_COUNT個を置き、マス数がその広さになる", () => {
    for (const id of Object.keys(BOARD_SIZES)) {
      const cells = cellCountOf(id);
      const board = generateSample(POOL, createRandom(7), cells);
      expect(board).toHaveLength(cells);
      expect(placedCount(board)).toBe(PLACE_COUNT);
      expect(hasDuplicateItem(board)).toBe(false);
    }
  });

  it("広さが違えば見本も変わる", () => {
    const intro = generateSample(POOL, createRandom(7), cellCountOf("intro"));
    const advanced = generateSample(POOL, createRandom(7), cellCountOf("advanced"));
    expect(intro).not.toEqual(advanced);
  });
});
