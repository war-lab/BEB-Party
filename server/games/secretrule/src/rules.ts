// 規則の判定関数（基本設計/14_SECRETRULEゲームモジュール.md の「語の数え方」「判定関数」、ADR-0030）。
//
// 見るのは語数、照合語、英字、末尾の記号、最初の語だけであり、いずれも文字列の処理である。
// 英語の意味を解釈しない（不変条件1）。
// 判定関数はサーバだけが持つ。公式のクライアントは英文に対する候補の成否を計算しない（14の「置き場所」）。
//
// 入力はすべて normalizeSubmission を通した後のテキストとする。
import { countWords, type EndMark, type RuleSpec } from "@beb/shared-secretrule";

/**
 * 照合語の並び。英字の連続を取り出して小文字にする。
 *
 * 英字に挟まれたアポストロフィとハイフンは語の内側として扱う。`couldn't` を `couldn` と `t` に
 * 分けると、卓が7文字の語と読む語が6文字の語として判定される（14の「語の数え方」）。
 */
export function matchWordsOf(normalized: string): string[] {
  return (normalized.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/gu) ?? []).map((word) => word.toLowerCase());
}

/** 照合語の文字数。アポストロフィとハイフンは数えない */
export function letterCountOf(matchWord: string): number {
  return matchWord.replace(/['-]/gu, "").length;
}

/** 末尾から外す閉じ引用符と閉じ括弧 */
const TRAILING_CLOSERS = new Set(['"', "'", ")", "]"]);

/**
 * 末尾の閉じ引用符と閉じ括弧を除いた最後の文字。
 *
 * `(Do you like cats?)` や `He said "Really?"` を、卓は疑問符で終わる文と読む（14の判定関数）。
 */
export function lastMeaningfulCharOf(normalized: string): string {
  const chars = [...normalized];
  let end = chars.length - 1;
  while (end >= 0 && (TRAILING_CLOSERS.has(chars[end] as string) || chars[end] === " ")) {
    end -= 1;
  }
  return end >= 0 ? (chars[end] as string) : "";
}

/**
 * 最初の語の最初の英字か数字（小文字）。
 *
 * 最初の語は、半角空白で区切った要素のうち英字か数字を含む最初の要素とする。語数の数え方と同じく、
 * 記号だけの要素（`... Today` の `...`）は語に数えない（14の「語の数え方」）。
 * 照合語ではなく最初の語で見るのは、`123 is my number.` の最初の語を卓は `123` と読むためである。
 * 要素の先頭の記号を飛ばすのは、`"Today` や `(Today` を卓は t で始まる文と読むためである。
 */
export function firstCharOf(normalized: string): string {
  const first = normalized.split(" ").find((element) => /[A-Za-z0-9]/u.test(element)) ?? "";
  const match = first.match(/[A-Za-z0-9]/u);
  return match === null ? "" : match[0].toLowerCase();
}

function hasLetter(normalized: string, letter: string): boolean {
  return normalized.toLowerCase().includes(letter.toLowerCase());
}

function endsWith(normalized: string, mark: EndMark): boolean {
  return lastMeaningfulCharOf(normalized) === mark;
}

/** 規則を満たすか。規則の意味の正本はこの関数である（ADR-0030） */
export function satisfies(spec: RuleSpec, normalized: string): boolean {
  switch (spec.ruleId) {
    case "min_words":
      return countWords(normalized) >= spec.params.n;
    case "max_words":
      return countWords(normalized) <= spec.params.n;
    case "has_word": {
      const words = new Set(matchWordsOf(normalized));
      return spec.params.words.some((word) => words.has(word.toLowerCase()));
    }
    case "no_word": {
      const words = new Set(matchWordsOf(normalized));
      return spec.params.words.every((word) => !words.has(word.toLowerCase()));
    }
    case "has_letter":
      return hasLetter(normalized, spec.params.letter);
    case "no_letter":
      return !hasLetter(normalized, spec.params.letter);
    case "ends_with":
      return endsWith(normalized, spec.params.mark);
    case "long_word":
      return matchWordsOf(normalized).some((word) => letterCountOf(word) >= spec.params.n);
    case "short_words":
      // 照合語が無い文は満たす（14の判定関数）
      return matchWordsOf(normalized).every((word) => letterCountOf(word) <= spec.params.n);
    case "starts_with":
      return firstCharOf(normalized) === spec.params.letter.toLowerCase();
  }
}

/**
 * 重複の判定に使う比較キー（14の「重複する英文を拒否する」）。
 *
 * 照合語と数字の連続を出現順に並べた列、末尾の記号、語数の組とする。
 * 句点の有無や大文字と小文字の違いだけの英文は成否が同じであり、出し直しても情報が増えない。
 * 語数を含めるのは、`cats,dogs` と `cats, dogs` のように照合語が同じでも語数が違い、
 * 語数の規則で成否が分かれる英文を同じとみなさないためである。
 */
export function comparisonKeyOf(normalized: string): string {
  const tokens = (normalized.match(/[A-Za-z]+(?:['-][A-Za-z]+)*|[0-9]+/gu) ?? []).map((token) => token.toLowerCase());
  const last = lastMeaningfulCharOf(normalized);
  const endMark = last === "?" || last === "!" ? last : "";
  return `${tokens.join(" ")}|${endMark}|${countWords(normalized)}`;
}
