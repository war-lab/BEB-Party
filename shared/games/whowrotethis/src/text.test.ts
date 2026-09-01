import { describe, expect, it } from "vitest";
import { MAX_CHARS, MIN_WORDS, countChars, countWords, isSubmittable, normalizeSubmission } from "./text";

describe("normalizeSubmission", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeSubmission("  I like it too.  ")).toBe("I like it too.");
  });

  it("改行とタブを半角空白へ畳む", () => {
    expect(normalizeSubmission("I like\nit\ttoo.")).toBe("I like it too.");
  });

  it("連続する空白を1つへ畳む", () => {
    expect(normalizeSubmission("I    like   it  too.")).toBe("I like it too.");
  });

  it("全角空白を半角空白として扱う（日本語入力のまま英文を打つ経路）", () => {
    // 半角空白だけで区切ると1語と数えられ、4語の提出がtoo_shortで拒否される
    const zenkaku = "I　like　it　too.";
    expect(normalizeSubmission(zenkaku)).toBe("I like it too.");
    expect(countWords(normalizeSubmission(zenkaku))).toBe(4);
  });

  it("空白だけの入力は空文字になる", () => {
    expect(normalizeSubmission("　 \n\t ")).toBe("");
  });
});

describe("countWords", () => {
  it("正規化済みテキストの語数を数える", () => {
    expect(countWords("I like it too.")).toBe(4);
    expect(countWords("Yes.")).toBe(1);
  });

  it("空文字は0語とする", () => {
    expect(countWords("")).toBe(0);
  });
});

describe("countChars", () => {
  it("コードポイント数で数える", () => {
    expect(countChars("abc")).toBe(3);
    // サロゲートペアを2文字と数えない
    expect(countChars("👍👍")).toBe(2);
  });
});

describe("isSubmittable", () => {
  it("最低語数を満たさない提出を落とす", () => {
    expect(isSubmittable("I do not")).toBe(false);
    expect(countWords("I do not")).toBe(MIN_WORDS - 1);
  });

  it("最低語数を満たす提出を通す", () => {
    expect(isSubmittable("I do not know.")).toBe(true);
  });

  it("最大文字数を超える提出を落とす", () => {
    const long = `I ${"x".repeat(MAX_CHARS)} a b`;
    expect(countChars(long)).toBeGreaterThan(MAX_CHARS);
    expect(isSubmittable(long)).toBe(false);
  });

  it("最大文字数ちょうどの提出を通す", () => {
    const exact = `I ${"x".repeat(MAX_CHARS - 6)} a b`;
    expect(countChars(exact)).toBe(MAX_CHARS);
    expect(isSubmittable(exact)).toBe(true);
  });
});
