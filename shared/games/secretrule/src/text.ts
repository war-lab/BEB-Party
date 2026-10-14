// 提出テキストの正規化と計数（基本設計/14_SECRETRULEゲームモジュール.md の「正規化」「語の数え方」）。
//
// 語数と文字数を数えるだけであり、英語の意味を解釈しない（不変条件1）。
// クライアントの入力欄とサーバの submit が同じ関数を使う。照合語の分解と規則の判定は
// サーバだけが持つ（14の「置き場所」）。

/** 提出に要求する最低語数。1〜2語では試せる語と英字の組み合わせが少なすぎる（14の submit） */
export const MIN_WORDS = 3;

/** 提出の最大文字数。正規化後のコードポイント数で数える */
export const MAX_CHARS = 140;

/**
 * 提出テキストを正規化する。
 *
 * 1. NFKCで全角の英数字と記号を半角へ寄せる（`？` → `?`、`…` → `...`）
 * 2. 曲がった引用符を直線の引用符へ置き換える（NFKCは `’` を変えない）
 * 3. 空白文字の連続を半角空白1つへ畳み、前後の空白を落とす
 *
 * 11の正規化は手順3だけである。スマホの日本語入力では全角の `？` や自動で曲がる `’` が混じり、
 * 足さないと規則を正しく読んで書いた英文が不通過になる（14の「正規化」）。
 */
export function normalizeSubmission(text: string): string {
  return (
    text
      .normalize("NFKC")
      .replace(/[‘’]/gu, "'")
      .replace(/[“”]/gu, '"')
      // JavaScriptの \s はU+3000（全角空白）とNBSPを含む。NFKC後は全角空白も半角になっている
      .replace(/\s+/gu, " ")
      .trim()
  );
}

/**
 * 正規化済みテキストの語数。
 *
 * 半角空白で区切った要素のうち、英字か数字を1つ以上含むものを数える。
 * 記号だけの要素を除くのは、`cats ?` のように記号の前に空白を入れる書き方で語数が増え、
 * 「6語以上」を読んだ卓の数え方とずれるためである（14の「語の数え方」）。
 */
export function countWords(normalized: string): number {
  if (normalized === "") {
    return 0;
  }
  return normalized.split(" ").filter((element) => /[A-Za-z0-9]/u.test(element)).length;
}

/** 正規化済みテキストの文字数。コードポイント数で数える */
export function countChars(normalized: string): number {
  return [...normalized].length;
}

/** 正規化済みテキストが提出の条件（語数と文字数）を満たすか */
export function isSubmittable(normalized: string): boolean {
  return countWords(normalized) >= MIN_WORDS && countChars(normalized) <= MAX_CHARS;
}
