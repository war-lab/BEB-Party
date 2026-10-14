// 規則パックのスキーマと規則IDの定義。このファイルの型定義がスキーマの正本である
// （基本設計/14_SECRETRULEゲームモジュール.md の「判定関数」「コンテンツ形式」、ADR-0030）。
//
// 規則の意味（判定関数）はサーバだけが持つ。ここに置くのは規則IDとパラメータの形、
// パラメータの範囲、言い回しの穴の置き換えだけである。

/** 規則ID。規則の意味はコードに置き、コンテンツは規則IDとパラメータで参照する（ADR-0030） */
export const RULE_IDS = [
  "min_words",
  "max_words",
  "has_word",
  "no_word",
  "has_letter",
  "no_letter",
  "ends_with",
  "long_word",
  "short_words",
  "starts_with",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

/** 末尾の記号として指定できる文字 */
export const END_MARKS = ["?", "!"] as const;

export type EndMark = (typeof END_MARKS)[number];

/** 規則IDとパラメータの組。規則IDごとにパラメータの形が決まる */
export type RuleSpec =
  | { ruleId: "min_words"; params: { n: number } }
  | { ruleId: "max_words"; params: { n: number } }
  | { ruleId: "has_word"; params: { words: string[] } }
  | { ruleId: "no_word"; params: { words: string[] } }
  | { ruleId: "has_letter"; params: { letter: string } }
  | { ruleId: "no_letter"; params: { letter: string } }
  | { ruleId: "ends_with"; params: { mark: EndMark } }
  | { ruleId: "long_word"; params: { n: number } }
  | { ruleId: "short_words"; params: { n: number } }
  | { ruleId: "starts_with"; params: { letter: string } };

/** 言い回しの穴の名前。規則IDごとにちょうど1つの穴を持つ */
export type PhraseHole = "n" | "words" | "letter" | "mark";

/** 規則IDごとの穴（14の検証5）。言い回しはこの穴をちょうど1回含み、他の穴を含まない */
export const RULE_HOLES: Record<RuleId, PhraseHole> = {
  min_words: "n",
  max_words: "n",
  has_word: "words",
  no_word: "words",
  has_letter: "letter",
  no_letter: "letter",
  ends_with: "mark",
  long_word: "n",
  short_words: "n",
  starts_with: "letter",
};

/**
 * 数値パラメータの範囲（14の「判定関数」の表）。
 *
 * 自然な英文で満たす割合が極端にならない値に絞っている。`min_words` の8超、`max_words` の7、
 * `long_word` の10は、レビューの計測で通過率が2%以下か98%に達した。
 */
export const NUMBER_PARAM_RANGES: Record<"min_words" | "max_words" | "long_word" | "short_words", { min: number; max: number }> = {
  min_words: { min: 5, max: 8 },
  max_words: { min: 4, max: 6 },
  long_word: { min: 7, max: 9 },
  short_words: { min: 4, max: 6 },
};

/** `has_word` と `no_word` が持てる語の件数の範囲 */
export const WORD_LIST_RANGES: Record<"has_word" | "no_word", { min: number; max: number }> = {
  has_word: { min: 1, max: 10 },
  no_word: { min: 1, max: 3 },
};

/**
 * 1文字の語として指定できる語（小文字で比べる）。
 *
 * それ以外の1文字は、`e.g.` のような略語が照合語に分かれたものと区別できない（14の検証4）。
 */
export const SINGLE_LETTER_WORDS = ["a", "i"] as const;

/** 候補の母集団の1件 */
export type CandidateSpec = { id: string } & RuleSpec;

/** 規則IDごとの言い回し。`{n}` などの穴を start で置き換える */
export interface RulePhrase {
  en: string;
  ja: string;
}

/** 報告と相談に使う言い回し */
export interface KeyExpression {
  en: string;
  ja: string;
}

/** 英文の書き出しの例。空欄（`...`）を含む枠にする（14の検証10） */
export interface Starter {
  en: string;
  ja: string;
}

/** 規則パック1本。content/secretrule/<id>.json の中身 */
export interface SecretRulePack {
  id: string;
  title: string;
  keyExpressions: KeyExpression[];
  starters: Starter[];
  candidates: CandidateSpec[];
  rulePhrases: Partial<Record<RuleId, RulePhrase>>;
}

/** 書き出しの例の空欄を表す記号（14の検証10） */
export const STARTER_BLANK = "...";

/** 書き出しの例が空欄を含むか（そのまま提出できる完成文になっていないか） */
export function hasStarterBlank(starter: string): boolean {
  return starter.includes(STARTER_BLANK);
}

/** 規則IDかどうか */
export function isRuleId(value: unknown): value is RuleId {
  return typeof value === "string" && (RULE_IDS as readonly string[]).includes(value);
}

/** 穴へ入れる文字列。`words` はカンマと空白で連結する（14のコンテンツ形式） */
export function holeValueOf(spec: RuleSpec): string {
  switch (spec.ruleId) {
    case "min_words":
    case "max_words":
    case "long_word":
    case "short_words":
      return String(spec.params.n);
    case "has_word":
    case "no_word":
      return spec.params.words.join(", ");
    case "has_letter":
    case "no_letter":
    case "starts_with":
      return spec.params.letter;
    case "ends_with":
      return spec.params.mark;
  }
}

/** 言い回しの穴を置き換える */
export function renderPhrase(phrase: RulePhrase, spec: RuleSpec): RulePhrase {
  const hole = `{${RULE_HOLES[spec.ruleId]}}`;
  const value = holeValueOf(spec);
  return { en: phrase.en.split(hole).join(value), ja: phrase.ja.split(hole).join(value) };
}
