// 検証テストとモジュールテスト用のお題データ。
// 本番のセットとして扱われないよう content/ の外に置く（09のテスト観点）。
//
// 基準となる正常なセット（validSet）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import { MIN_CARDS, TABOO_PER_CARD, type Card, type TabooSet } from "@beb/shared-dontsayit";

/** 1始まりの連番をA, B, ..., Z, AA のような英字へ変換する。正解名に数字を混ぜないため */
export function letters(index: number): string {
  let result = "";
  let rest = index;
  while (rest > 0) {
    const remainder = (rest - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    rest = Math.floor((rest - 1) / 26);
  }
  return result === "" ? "A" : result;
}

/** 正解名と禁止語が語として重ならないカードを作る */
export function card(index: number): Card {
  const suffix = letters(index);
  return {
    id: `card_${suffix}`,
    answer: `Name${suffix}`,
    taboo: Array.from({ length: TABOO_PER_CARD }, (_, position) => `clue${suffix}${letters(position + 1)}`),
  };
}

export function validSet(cardCount: number = MIN_CARDS): TabooSet {
  return {
    id: "fixture_set_v1",
    title: "Fixture Set",
    cards: Array.from({ length: cardCount }, (_, index) => card(index + 1)),
    constraints: [
      { id: "verbs_only", ja: "動詞を中心に説明する", en: "Use verbs, not nouns." },
      { id: "three_words", ja: "1文3語以内で言う", en: "Three words per sentence." },
    ],
    keyExpressions: [{ en: "He is the one who ...", ja: "〜した人です" }],
  };
}
