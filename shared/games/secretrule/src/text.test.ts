// 提出テキストの正規化と計数（基本設計/14の「正規化」「語の数え方」）
import { describe, expect, it } from "vitest";
import { MAX_CHARS, MIN_WORDS, countChars, countWords, isSubmittable, normalizeSubmission } from "./text";

describe("normalizeSubmission", () => {
  it("全角の英数字と記号を半角へ寄せる", () => {
    expect(normalizeSubmission("Do you like cats？")).toBe("Do you like cats?");
    expect(normalizeSubmission("Ｉ have ３ dogs！")).toBe("I have 3 dogs!");
    expect(normalizeSubmission("Wait…")).toBe("Wait...");
  });

  it("曲がった引用符を直線の引用符へ置き換える", () => {
    expect(normalizeSubmission("I\u2019m \u201Chappy\u201D")).toBe(`I'm "happy"`);
  });

  it("書式制御文字（ゼロ幅空白など）を取り除く", () => {
    expect(normalizeSubmission("I like ca\u200Bts.")).toBe("I like cats.");
    expect(normalizeSubmission("\u202EI like cats.")).toBe("I like cats.");
  });

  it("全角空白・改行・連続空白を半角空白1つへ畳み、前後を落とす", () => {
    expect(normalizeSubmission("  I　like\n\ncats  ")).toBe("I like cats");
  });
});

describe("countWords", () => {
  it("英字か数字を含む要素だけを数える", () => {
    expect(countWords("Do you like cats ?")).toBe(4);
    expect(countWords("Hi ! !")).toBe(1);
    expect(countWords("I have 3 cats!")).toBe(4);
    expect(countWords("I'm happy.")).toBe(2);
  });

  it("空文字は0語", () => {
    expect(countWords("")).toBe(0);
  });
});

describe("isSubmittable", () => {
  it(`${MIN_WORDS}語未満は提出できない`, () => {
    expect(isSubmittable("I like")).toBe(false);
    expect(isSubmittable("I like cats.")).toBe(true);
  });

  it(`${MAX_CHARS}文字を超えると提出できない`, () => {
    const long = `I like ${"a".repeat(MAX_CHARS)}`;
    expect(countChars(long)).toBeGreaterThan(MAX_CHARS);
    expect(isSubmittable(long)).toBe(false);
  });
});
