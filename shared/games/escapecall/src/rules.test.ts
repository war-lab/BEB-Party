import { describe, expect, it } from "vitest";
import { rankOf } from "./game";
import { phraseTierFor, ruleTextFor, type RulePhrase } from "./pack";
import { applyDigitRule, applySymbolRule, computeCode, type RuleId } from "./rules";
import type { SymbolId } from "./symbols";

const ORDER: SymbolId[] = ["red_star", "black_circle", "blue_square", "yellow_triangle"];
const MAP = new Map<SymbolId, string>([
  ["red_star", "1"],
  ["black_circle", "2"],
  ["blue_square", "3"],
  ["yellow_triangle", "9"],
]);

describe("規則の作用", () => {
  // 規則の意味はコードが正本（ADR-0027）。作用を取り違えると、言い回しと答えが食い違う
  it("skip_color は指定色を、skip_shape は指定形を除く", () => {
    expect(applySymbolRule({ ruleId: "skip_color", param: "black" }, ORDER)).toEqual([
      "red_star",
      "blue_square",
      "yellow_triangle",
    ]);
    expect(applySymbolRule({ ruleId: "skip_shape", param: "square" }, ORDER)).toEqual([
      "red_star",
      "black_circle",
      "yellow_triangle",
    ]);
  });

  it("reverse は右から左へ読み、swap_ends は両端を入れ替え、add_one は9を0にする", () => {
    expect(applySymbolRule({ ruleId: "reverse" }, ORDER)).toEqual([...ORDER].reverse());
    expect(applyDigitRule({ ruleId: "swap_ends" }, ["1", "2", "3"])).toEqual(["3", "2", "1"]);
    expect(applyDigitRule({ ruleId: "add_one" }, ["1", "9"])).toEqual(["2", "0"]);
  });

  it("記号の規則を先に、数字の規則を後に適用して答えを出す", () => {
    expect(computeCode(ORDER, [], MAP)).toBe("1239");
    expect(computeCode(ORDER, [{ ruleId: "reverse" }, { ruleId: "add_one" }], MAP)).toBe("0432");
  });

  it("対応表に無い記号が残ると答えを返さない", () => {
    const partial = new Map(MAP);
    partial.delete("blue_square");
    expect(computeCode(ORDER, [], partial)).toBeUndefined();
  });
});

describe("規則の言い回し", () => {
  const phrases = {
    skip_color: { easy: "Skip the {color} ones.", standard: "Ignore every {color} symbol.", ja: "{color}は飛ばす" },
    skip_shape: { easy: "Skip the {shape}s.", standard: "Leave out every {shape}.", ja: "{shape}は飛ばす" },
    reverse: { easy: "Right to left.", standard: "Read it backwards.", ja: "逆から" },
    swap_ends: { easy: "Swap ends.", standard: "Switch the ends.", ja: "両端を交換" },
    add_one: { easy: "Add one.", standard: "Make each bigger.", ja: "1を足す" },
  } satisfies Record<RuleId, RulePhrase>;

  // レベル差の吸収の第2層。段の取り違えと、穴の置き換え漏れ（{color}が画面に出る）を防ぐ
  it("レベル1〜2は easy と日本語の補足、3〜5は standard だけを返し、穴を色名で埋める", () => {
    expect(phraseTierFor(2)).toBe("easy");
    expect(phraseTierFor(3)).toBe("standard");
    expect(ruleTextFor(phrases, { ruleId: "skip_color", param: "black" }, 1)).toEqual({
      textEn: "Skip the black ones.",
      textJa: "黒は飛ばす",
    });
    expect(ruleTextFor(phrases, { ruleId: "skip_shape", param: "star" }, 5)).toEqual({
      textEn: "Leave out every star.",
    });
  });
});

describe("rankOf", () => {
  // 13の結果の表。境界の前後で確かめる
  it("脱出時はヒントと誤答の数で S / A / B、未脱出は開けた錠の有無で C / D になる", () => {
    expect(rankOf(true, 3, 0, 2)).toBe("S");
    expect(rankOf(true, 3, 0, 3)).toBe("A");
    expect(rankOf(true, 3, 1, 0)).toBe("A");
    expect(rankOf(true, 3, 2, 5)).toBe("A");
    expect(rankOf(true, 3, 3, 0)).toBe("B");
    expect(rankOf(true, 3, 2, 6)).toBe("B");
    expect(rankOf(false, 1, 0, 0)).toBe("C");
    expect(rankOf(false, 0, 0, 0)).toBe("D");
  });
});
