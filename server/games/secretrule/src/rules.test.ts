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
    expect(letterCountOf("black-and-white")).toBe(13);
  });

  it("末尾の閉じ引用符と閉じ括弧を除く", () => {
    expect(lastMeaningfulCharOf('He said "Really?"')).toBe("?");
    expect(lastMeaningfulCharOf("(Do you like cats?)")).toBe("?");
  });

  it("最初の語は英数字を含む最初の要素で、その最初の英数字を見る", () => {
    expect(firstCharOf("(Do you like cats?)")).toBe("d");
    expect(firstCharOf("...Today is good.")).toBe("t");
    expect(firstCharOf("... Today is good.")).toBe("t");
    expect(firstCharOf("- I like cats.")).toBe("i");
    expect(firstCharOf("123 is my number.")).toBe("1");
  });
});

describe("数値パラメータの境界（n ちょうどとその前後）", () => {
  it("min_words: n-1 語は満たさず、n 語と n+1 語は満たす", () => {
    const spec: RuleSpec = { ruleId: "min_words", params: { n: 5 } };
    expect(check(spec, "I like my big cat.")).toBe(true);
    expect(check(spec, "I like my big fat cat.")).toBe(true);
    expect(check(spec, "I like big cats.")).toBe(false);
    // 記号だけの要素は数えない
    expect(check(spec, "I like big cats !")).toBe(false);
  });

  it("max_words: n+1 語は満たさず、n 語と n-1 語は満たす", () => {
    const spec: RuleSpec = { ruleId: "max_words", params: { n: 5 } };
    expect(check(spec, "I like my big cat.")).toBe(true);
    expect(check(spec, "I like big cats.")).toBe(true);
    expect(check(spec, "I like my big fat cat.")).toBe(false);
    expect(check(spec, "Do you like my cats ?")).toBe(true);
  });

  it("long_word: n-1 文字の語だけでは満たさず、n 文字の語で満たす", () => {
    const spec: RuleSpec = { ruleId: "long_word", params: { n: 7 } };
    expect(check(spec, "I like teacher.")).toBe(true);
    expect(check(spec, "I like doctor.")).toBe(false);
    expect(check(spec, "I couldn't sleep.")).toBe(true);
    expect(check(spec, "It is a well-known shop.")).toBe(true);
  });

  it("short_words: n 文字の語までは満たし、n+1 文字の語で満たさない", () => {
    const spec: RuleSpec = { ruleId: "short_words", params: { n: 4 } };
    expect(check(spec, "This cat ran fast.")).toBe(true);
    expect(check(spec, "This cat ran quick.")).toBe(false);
    expect(check(spec, "They aren't here.")).toBe(false);
    expect(check(spec, "1 2 3")).toBe(true);
  });
});

describe("satisfies", () => {
  it("has_word / no_word は照合語の完全一致で見る。I'm は I を含まない", () => {
    const noI: RuleSpec = { ruleId: "no_word", params: { words: ["I"] } };
    expect(check(noI, "I'm happy now.")).toBe(true);
    expect(check(noI, "Today I ran.")).toBe(false);
    expect(check({ ruleId: "has_word", params: { words: ["red", "blue"] } }, "My BLUE bag is here.")).toBe(true);
    expect(check({ ruleId: "has_word", params: { words: ["cat"] } }, "I like cats.")).toBe(false);
    expect(check({ ruleId: "has_word", params: { words: ["black"] } }, "I like black-and-white films.")).toBe(false);
  });

  it("has_letter / no_letter は大文字と小文字を区別しない。全角も半角に寄せてから見る", () => {
    expect(check({ ruleId: "has_letter", params: { letter: "z" } }, "Zoo is fun.")).toBe(true);
    expect(check({ ruleId: "has_letter", params: { letter: "z" } }, "It is fun.")).toBe(false);
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

  it("starts_with は最初の語の最初の英数字で見る", () => {
    const startsT: RuleSpec = { ruleId: "starts_with", params: { letter: "t" } };
    expect(check(startsT, "Today is fun.")).toBe(true);
    expect(check(startsT, '"Today is fun," she said.')).toBe(true);
    expect(check(startsT, "... Today is fun.")).toBe(true);
    expect(check(startsT, "Yesterday was fun.")).toBe(false);
    expect(check({ ruleId: "starts_with", params: { letter: "i" } }, "123 is my number.")).toBe(false);
  });

  it("書式制御文字は正規化で取り除かれ、語を分けない", () => {
    const zeroWidth = String.fromCharCode(0x200b);
    expect(check({ ruleId: "has_word", params: { words: ["cats"] } }, `I like ca${zeroWidth}ts.`)).toBe(true);
  });
});

describe("comparisonKeyOf", () => {
  it("句点、大文字と小文字、全角と半角、曲がった引用符だけの違いを同じとみなす", () => {
    const base = comparisonKeyOf(normalizeSubmission("I'm happy now."));
    expect(comparisonKeyOf(normalizeSubmission("i’m HAPPY now"))).toBe(base);
    expect(comparisonKeyOf(normalizeSubmission("Ｉ'm happy now ."))).toBe(base);
  });

  it("末尾の ? と ! の違い、1語の違い、語数の違いは別の英文とみなす", () => {
    const base = comparisonKeyOf(normalizeSubmission("You like cats."));
    expect(comparisonKeyOf(normalizeSubmission("You like cats?"))).not.toBe(base);
    expect(comparisonKeyOf(normalizeSubmission("You like dogs."))).not.toBe(base);
    // 照合語は同じでも、空白の有無で語数が変わり、語数の規則で成否が分かれる
    expect(comparisonKeyOf(normalizeSubmission("I like cats,dogs and birds."))).not.toBe(
      comparisonKeyOf(normalizeSubmission("I like cats, dogs and birds.")),
    );
  });
});
