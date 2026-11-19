// 手番の算出と得点の計算（基本設計/17の「公開状態」「得点」）。
import { describe, expect, it } from "vitest";
import {
  LAPS,
  TEAM_SIZES,
  THEME_CHOICE_COUNT,
  joinValueOf,
  lapOf,
  maxAllyPicksOf,
  speakerOf,
  teamScoreOf,
  totalTurnsOf,
} from "./game";

describe("人数構成", () => {
  it("4〜8人の sizes と maxAllyPicks が17の表どおり", () => {
    expect(TEAM_SIZES).toEqual({ 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4] });
    expect([4, 5, 6, 7, 8].map((count) => maxAllyPicksOf(TEAM_SIZES[count]!))).toEqual([1, 2, 2, 3, 3]);
  });

  it("選択肢は6件", () => {
    expect(THEME_CHOICE_COUNT).toBe(6);
  });
});

describe("手番", () => {
  const order = ["a", "b", "c"];

  it("手番の人は speakerOrder[turnIndex % 人数]、2周目も同じ順", () => {
    expect([0, 1, 2, 3, 4, 5].map((turnIndex) => speakerOf({ speakerOrder: order, turnIndex }))).toEqual([
      "a",
      "b",
      "c",
      "a",
      "b",
      "c",
    ]);
  });

  it("何周目かと手番の総数", () => {
    expect(lapOf({ speakerOrder: order, turnIndex: 2 })).toBe(1);
    expect(lapOf({ speakerOrder: order, turnIndex: 3 })).toBe(2);
    expect(totalTurnsOf({ speakerOrder: order, laps: LAPS })).toBe(6);
  });

  it("speakerOrder が空なら手番の人はいない", () => {
    expect(speakerOf({ speakerOrder: [], turnIndex: 0 })).toBeUndefined();
  });
});

describe("得点", () => {
  it("合流の値は誤った選択を差し引き、0で下限を取る", () => {
    expect(joinValueOf(3, 0, 3)).toBe(1);
    expect(joinValueOf(2, 1, 3)).toBeCloseTo(1 / 3);
    expect(joinValueOf(1, 2, 3)).toBe(0);
    // 奇数人数の小さいチームの人（味方2人）が上限3人まで選ぶと、全員当てても1人分を差し引かれる
    expect(joinValueOf(2, 1, 2)).toBe(0.5);
    expect(joinValueOf(2, 0, 2)).toBe(1);
    expect(joinValueOf(0, 0, 0)).toBe(0);
  });

  it("チームの得点は round(合流率×50 + 見抜き率×50)。0.5は切り上げる", () => {
    expect(teamScoreOf(1, 1)).toBe(100);
    expect(teamScoreOf(0, 0)).toBe(0);
    // 4人チームの合流率 1/4（3人分の 1/3 を12で割った値）。12.5 は 13 になる
    expect(teamScoreOf((1 / 3 + 1 / 3 + 1 / 3 + 0) / 4 / 1, 0)).toBe(13);
    expect(teamScoreOf(1 / 3, 0)).toBe(17);
    expect(teamScoreOf(0.5, 0.5)).toBe(50);
  });

  // 浮動小数の誤差の補正（+1e-9）を消すと、正しくは37.5点（切り上げで38点）の合流率が
  // 37.49999999999999 になり37点に落ちる。足し算の順で結果が変わるため、この順で書く
  it("浮動小数の誤差で .5 を切り捨てない（37.5 は 38）", () => {
    const joinRate = (1 / 3 + 1 + 1 + 2 / 3) / 4;
    expect(joinRate * 50).not.toBe(37.5);
    expect(teamScoreOf(joinRate, 0)).toBe(38);
  });
});
