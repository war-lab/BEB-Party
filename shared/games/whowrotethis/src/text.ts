// 提出テキストの正規化と計数（基本設計/11_WHOWROTETHISゲームモジュール.md の submit）。
//
// 語数と文字数を数えるだけであり、英語の意味を解釈しない（不変条件1）。
// validateContent の検証7（hintEn の語数）もこの関数を使う。

/** 提出に要求する最低語数。1〜2語では誰の文かを判別する材料が場に出ない（11の submit） */
export const MIN_WORDS = 4;

/** 提出の最大文字数。コードポイント数で数える */
export const MAX_CHARS = 140;

/**
 * 提出テキストを正規化する。
 *
 * 改行・タブ・全角空白を含む空白文字を半角空白へ置き換え、連続する空白を1つへ畳み、
 * 前後の空白を落とす。全角空白を含めるのは、日本語入力のまま英文を打つと語の区切りに
 * 全角空白が混じり、半角空白だけで区切ると4語の提出が1語と数えられるためである（11の submit）。
 */
export function normalizeSubmission(text: string): string {
  // JavaScriptの \s はU+3000（全角空白）とNBSPを含む（実測）。文字クラスへ列挙しない
  return text.replace(/\s+/gu, " ").trim();
}

/** 正規化済みテキストの語数。半角空白で区切った要素数で数える */
export function countWords(normalized: string): number {
  if (normalized === "") {
    return 0;
  }
  return normalized.split(" ").length;
}

/** 正規化済みテキストの文字数。コードポイント数で数える */
export function countChars(normalized: string): number {
  return [...normalized].length;
}

/** 正規化済みテキストが提出の条件（語数と文字数）を満たすか */
export function isSubmittable(normalized: string): boolean {
  return countWords(normalized) >= MIN_WORDS && countChars(normalized) <= MAX_CHARS;
}
