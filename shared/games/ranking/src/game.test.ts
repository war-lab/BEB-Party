// 述語の判定と難度の導出を固定する。ここが崩れると得点も検証も同時に狂う（基本設計/10）
import { describe, expect, it } from "vitest";
import {
  DEAL_SHAPES,
  DIFFICULTY_SHAPE,
  countByDifficulty,
  dealShapeFor,
  DISCUSSION_SECONDS,
  GOALS_PER_SET,
  ITEMS_PER_SET,
  ROUNDS,
  achieves,
  difficultyOf,
  goalKey,
  hintCountFor,
  permutations,
  rankOf,
  type Goal,
} from "./index";

/** sleep=1位, money=2位, friends=3位, food=4位, work=5位 */
const RANKING = ["sleep", "money", "friends", "food", "work"];

describe("rankOf", () => {
  it("1始まりの順位を返す", () => {
    expect(rankOf(RANKING, "sleep")).toBe(1);
    expect(rankOf(RANKING, "work")).toBe(5);
  });

  it("含まれない項目はnull", () => {
    expect(rankOf(RANKING, "music")).toBeNull();
  });
});

describe("achieves", () => {
  it("above: 上位にあるときだけ真", () => {
    expect(achieves({ type: "above", item: "sleep", than: "money" }, RANKING)).toBe(true);
    expect(achieves({ type: "above", item: "money", than: "sleep" }, RANKING)).toBe(false);
  });

  it("top: within位以内で真", () => {
    expect(achieves({ type: "top", item: "money", within: 2 }, RANKING)).toBe(true);
    expect(achieves({ type: "top", item: "friends", within: 2 }, RANKING)).toBe(false);
    expect(achieves({ type: "top", item: "sleep", within: 1 }, RANKING)).toBe(true);
  });

  it("bottom: 下からwithin位以内で真", () => {
    expect(achieves({ type: "bottom", item: "work", within: 1 }, RANKING)).toBe(true);
    expect(achieves({ type: "bottom", item: "food", within: 2 }, RANKING)).toBe(true);
    expect(achieves({ type: "bottom", item: "friends", within: 2 }, RANKING)).toBe(false);
  });

  it("exact: ちょうどその順位で真", () => {
    expect(achieves({ type: "exact", item: "friends", rank: 3 }, RANKING)).toBe(true);
    expect(achieves({ type: "exact", item: "friends", rank: 2 }, RANKING)).toBe(false);
  });

  it("参照する項目が順位に無ければ偽", () => {
    expect(achieves({ type: "top", item: "music", within: 5 }, RANKING)).toBe(false);
    expect(achieves({ type: "above", item: "sleep", than: "music" }, RANKING)).toBe(false);
  });
});

describe("difficultyOf", () => {
  it("述語の型から難度を導く", () => {
    expect(difficultyOf({ type: "above", item: "a", than: "b" })).toBe(1);
    expect(difficultyOf({ type: "top", item: "a", within: 2 })).toBe(1);
    expect(difficultyOf({ type: "bottom", item: "a", within: 3 })).toBe(1);
    expect(difficultyOf({ type: "top", item: "a", within: 1 })).toBe(2);
    expect(difficultyOf({ type: "bottom", item: "a", within: 1 })).toBe(2);
    expect(difficultyOf({ type: "exact", item: "a", rank: 3 })).toBe(3);
  });
});

describe("goalKey", () => {
  it("同じ述語は同じ鍵、違う述語は違う鍵になる", () => {
    const a: Goal = { type: "top", item: "sleep", within: 2 };
    const b: Goal = { type: "top", item: "sleep", within: 2 };
    const c: Goal = { type: "top", item: "sleep", within: 3 };
    expect(goalKey(a)).toBe(goalKey(b));
    expect(goalKey(a)).not.toBe(goalKey(c));
  });

  it("topとbottomのwithinが同じでも区別する", () => {
    expect(goalKey({ type: "top", item: "a", within: 2 })).not.toBe(
      goalKey({ type: "bottom", item: "a", within: 2 }),
    );
  });
});

describe("permutations", () => {
  it("5項目で120通りを返し、重複がない", () => {
    const all = permutations(RANKING);
    expect(all).toHaveLength(120);
    expect(new Set(all.map((entry) => entry.join(","))).size).toBe(120);
  });

  it("どの順列も元の要素を落とさない", () => {
    for (const entry of permutations(RANKING)) {
      expect([...entry].sort()).toEqual([...RANKING].sort());
    }
  });

  it("空と1件でも落ちない", () => {
    expect(permutations([])).toEqual([[]]);
    expect(permutations(["a"])).toEqual([["a"]]);
  });
});

describe("hintCountFor", () => {
  it("レベル1〜2へ3件、レベル3以上へ1件", () => {
    expect(hintCountFor(1)).toBe(3);
    expect(hintCountFor(2)).toBe(3);
    expect(hintCountFor(3)).toBe(1);
    expect(hintCountFor(5)).toBe(1);
  });
});

describe("定数", () => {
  it("目標カードの難度構成が8枚で昇順である", () => {
    expect(DIFFICULTY_SHAPE).toHaveLength(GOALS_PER_SET);
    expect([...DIFFICULTY_SHAPE]).toEqual([...DIFFICULTY_SHAPE].sort());
  });

  // 手札の形がセットの8枚から作れないと、割り当てが例外になり開始できない（10の目標の割り当て）
  it("各人数の手札の形が、人数と同じ枚数で、難度ごとにセットの枚数を超えない", () => {
    const available = countByDifficulty(DIFFICULTY_SHAPE);
    for (const [count, shape] of Object.entries(DEAL_SHAPES)) {
      expect(shape).toHaveLength(Number(count));
      expect([...shape]).toEqual([...shape].sort());
      const needed = countByDifficulty(shape);
      for (const difficulty of [1, 2, 3] as const) {
        expect(needed[difficulty]).toBeLessThanOrEqual(available[difficulty]);
      }
    }
  });

  // 8枚化で5〜6人の卓の難度配分を変えない（10の目標の割り当て）
  it("5人と6人の手札の形が6枚時代の配り方と同じである", () => {
    expect(dealShapeFor(5)).toEqual([1, 1, 2, 2, 3]);
    expect(dealShapeFor(6)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("8人の手札の形がセットの8枚すべてである", () => {
    expect(dealShapeFor(8)).toEqual([...DIFFICULTY_SHAPE]);
  });

  it("表に無い人数ではundefinedを返す", () => {
    expect(dealShapeFor(4)).toBeUndefined();
    expect(dealShapeFor(9)).toBeUndefined();
  });

  it("項目数が5、ラウンド数が3である", () => {
    expect(ITEMS_PER_SET).toBe(5);
    expect(ROUNDS).toBe(3);
  });

  it("議論時間の既定値が範囲に収まり、stepの倍数である", () => {
    expect(DISCUSSION_SECONDS.default).toBeGreaterThanOrEqual(DISCUSSION_SECONDS.min);
    expect(DISCUSSION_SECONDS.default).toBeLessThanOrEqual(DISCUSSION_SECONDS.max);
    expect(DISCUSSION_SECONDS.default % DISCUSSION_SECONDS.step).toBe(0);
    expect(DISCUSSION_SECONDS.min % DISCUSSION_SECONDS.step).toBe(0);
    expect(DISCUSSION_SECONDS.max % DISCUSSION_SECONDS.step).toBe(0);
  });
});
