// 判定関数の境界（基本設計/14のテスト観点「判定関数」）
import { normalizeSubmission, type RuleSpec } from "@beb/shared-secretrule";
import { describe, expect, it } from "vitest";
import { comparisonKeyOf, firstCharOf, lastMeaningfulCharOf, letterCountOf, matchWordsOf, satisfies } from "./rules";

function check(spec: RuleSpec, raw: string): boolean {
  return satisfies(spec, normalizeSubmission(raw));
}

describe("照合語と文字数", () => {
  it("アポストロフィとハイフンを語の内側として扱い、小文字にする", () => {
    expect(matchWordsOf("I'm a well-known cat.")).toEqual(["i'm", "a", "well-known", "cat"]);
    expect(matchWordsOf("3 cats.")).toEqual(["cats"]);
  });

  it("文字数はアポストロフィとハイフンを数えない", () => {
    expect(letterCountOf("couldn't")).toBe(7);
    expect(letterCountOf("well-known")).toBe(9);
  });

  it("末尾の閉じ引用符と閉じ括弧を除く", () => {
    expect(lastMeaningfulCharOf('He said "Really?"')).toBe("?");
    expect(lastMeaningfulCharOf("(Do you like cats?)")).toBe("?");
  });

  it("最初の語の先頭にある英数字以外の文字を除く", () => {
    expect(firstCharOf("(Do you like cats?)")).toBe("d");
    expect(firstCharOf("...Today is good.")).toBe("t");
    expect(firstCharOf("-Today is good.")).toBe("t");
    expect(firstCharOf("123 is my number.")).toBe("1");
  });
});

describe("satisfies", () => {
  it("min_words / max_words は記号だけの要素を数えない", () => {
    expect(check({ ruleId: "min_words", params: { n: 5 } }, "Do you like cats ?")).toBe(false);
    expect(check({ ruleId: "min_words", params: { n: 5 } }, "Do you like my cats?")).toBe(true);
    expect(check({ ruleId: "max_words", params: { n: 4 } }, "Do you like cats ?")).toBe(true);
  });

  it("has_word / no_word は照合語の完全一致で見る。I'm は I を含まない", () => {
    const noI: RuleSpec = { ruleId: "no_word", params: { words: ["I"] } };
    expect(check(noI, "I'm happy now.")).toBe(true);
    expect(check(noI, "Today I ran.")).toBe(false);
    expect(check({ ruleId: "has_word", params: { words: ["red", "blue"] } }, "My BLUE bag is here.")).toBe(true);
    expect(check({ ruleId: "has_word", params: { words: ["cat"] } }, "I like cats.")).toBe(false);
  });

  it("has_letter / no_letter は大文字と小文字を区別しない。全角も半角に寄せてから見る", () => {
    expect(check({ ruleId: "has_letter", params: { letter: "z" } }, "Zoo is fun.")).toBe(true);
    expect(check({ ruleId: "no_letter", params: { letter: "e" } }, "I am a cat.")).toBe(true);
    expect(check({ ruleId: "no_letter", params: { letter: "e" } }, "ＥＡＴ it now.")).toBe(false);
  });

  it("ends_with は全角、閉じ引用符、閉じ括弧のあとでも記号を見る", () => {
    const question: RuleSpec = { ruleId: "ends_with", params: { mark: "?" } };
    expect(check(question, "Do you like cats？")).toBe(true);
    expect(check(question, 'He said "Really?"')).toBe(true);
    expect(check(question, "(Do you like cats?)")).toBe(true);
    expect(check(question, "Do you like cats?!")).toBe(false);
    expect(check(question, "I like cats.")).toBe(false);
  });

  it("long_word / short_words は照合語の文字数で見る", () => {
    expect(check({ ruleId: "long_word", params: { n: 7 } }, "I couldn't sleep.")).toBe(true);
    expect(check({ ruleId: "long_word", params: { n: 7 } }, "I like cats.")).toBe(false);
    expect(check({ ruleId: "short_words", params: { n: 4 } }, "They aren't here.")).toBe(false);
    expect(check({ ruleId: "short_words", params: { n: 4 } }, "I am a cat.")).toBe(true);
    expect(check({ ruleId: "short_words", params: { n: 4 } }, "1 2 3")).toBe(true);
  });

  it("starts_with は最初の語の最初の文字で見る", () => {
    const startsT: RuleSpec = { ruleId: "starts_with", params: { letter: "t" } };
    expect(check(startsT, "Today is fun.")).toBe(true);
    expect(check(startsT, '"Today is fun," she said.')).toBe(true);
    expect(check({ ruleId: "starts_with", params: { letter: "i" } }, "123 is my number.")).toBe(false);
  });

  it("判定がテキストだけで決まる（同じ入力なら同じ結果）", () => {
    const spec: RuleSpec = { ruleId: "min_words", params: { n: 6 } };
    expect(check(spec, "I went to the park today.")).toBe(check(spec, "I went to the park today."));
  });
});

describe("comparisonKeyOf", () => {
  it("句点、大文字と小文字、全角と半角、曲がった引用符だけの違いを同じとみなす", () => {
    const base = comparisonKeyOf(normalizeSubmission("I'm happy now."));
    expect(comparisonKeyOf(normalizeSubmission("i’m HAPPY now"))).toBe(base);
    expect(comparisonKeyOf(normalizeSubmission("Ｉ'm happy now ."))).toBe(base);
  });

  it("末尾の ? と ! の違いと、1語の違いは別の英文とみなす", () => {
    const base = comparisonKeyOf(normalizeSubmission("You like cats."));
    expect(comparisonKeyOf(normalizeSubmission("You like cats?"))).not.toBe(base);
    expect(comparisonKeyOf(normalizeSubmission("You like dogs."))).not.toBe(base);
  });
});
