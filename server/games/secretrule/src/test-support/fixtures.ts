// 検証テストとモジュールテスト用の規則パック。
// 本番のパックとして扱われないよう content/ の外に置く（14のテスト観点）。
//
// 基準となる正常なパック（validPack）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import { fallbackPlayerIconId, type Player } from "@beb/shared-core";
import type { CandidateSpec, SecretRulePack } from "@beb/shared-secretrule";

export function validCandidates(): CandidateSpec[] {
  return [
    { id: "no_i", ruleId: "no_word", params: { words: ["I"] } },
    { id: "min7", ruleId: "min_words", params: { n: 7 } },
    { id: "max5", ruleId: "max_words", params: { n: 5 } },
    { id: "question", ruleId: "ends_with", params: { mark: "?" } },
    { id: "colors", ruleId: "has_word", params: { words: ["red", "blue", "green"] } },
    { id: "no_e", ruleId: "no_letter", params: { letter: "e" } },
    { id: "long8", ruleId: "long_word", params: { n: 8 } },
    { id: "start_t", ruleId: "starts_with", params: { letter: "t" } },
  ];
}

export function validPack(): SecretRulePack {
  return {
    id: "fixture_pack",
    title: "テスト用の規則",
    keyExpressions: [
      { en: "Mine passed.", ja: "私のは通った" },
      { en: "Mine failed.", ja: "私のはだめだった" },
      { en: "Let's test this one.", ja: "これを試そう" },
    ],
    starters: [
      { en: "My favorite food is ...", ja: "好きな食べ物は…" },
      { en: "Yesterday I went to ...", ja: "昨日…へ行った" },
      { en: "Do you like ...?", ja: "…は好き？" },
    ],
    candidates: validCandidates(),
    rulePhrases: {
      min_words: { en: "Use {n} or more words.", ja: "{n}語以上で書く" },
      max_words: { en: "Use {n} words or fewer.", ja: "{n}語以下で書く" },
      has_word: { en: "Use at least one of these words: {words}.", ja: "次の語のどれかを使う: {words}" },
      no_word: { en: "Do not use the word {words}.", ja: "{words} という語を使わない" },
      no_letter: { en: "Do not use the letter {letter}.", ja: "{letter} の文字を使わない" },
      ends_with: { en: "End the sentence with {mark}", ja: "文の最後を {mark} にする" },
      long_word: { en: "Use a word with {n} or more letters.", ja: "{n}文字以上の語を使う" },
      starts_with: { en: "The first word starts with {letter}.", ja: "最初の語を {letter} で始める" },
    },
  };
}

/** 参加者。全員つながっている状態で作る */
export function playersOf(count: number, hostIndex = 0): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player${index + 1}`,
    level: ((index % 5) + 1) as Player["level"],
    icon: fallbackPlayerIconId(`p${index + 1}`),
    connected: true,
    isHost: index === hostIndex,
  }));
}
