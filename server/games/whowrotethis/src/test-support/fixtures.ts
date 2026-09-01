// 検証テストとモジュールテスト用の質問データ。
// 本番のパックとして扱われないよう content/ の外に置く（11のテスト観点）。
//
// 基準となる正常なパック（validPack）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import { fallbackPlayerIconId, type Player } from "@beb/shared-core";
import { MIN_QUESTIONS, type Question, type WhoWroteThisPack } from "@beb/shared-whowrotethis";

function hints(): string[] {
  return ["I would eat curry.", "My answer is ramen.", "I want to eat sushi."];
}

export function validQuestion(suffix: number = 1): Question {
  return {
    id: `q_${suffix}`,
    en: `What would you eat on day ${suffix}?`,
    ja: `${suffix}日目は何を食べる？`,
    hintEn: hints(),
  };
}

export function validPack(questionCount: number = MIN_QUESTIONS): WhoWroteThisPack {
  return {
    id: "fixture_pack",
    title: "Fixture Pack",
    keyExpressions: [
      { en: "This sounds like Ken.", ja: "これはKenっぽい" },
      { en: "It is too polite for him.", ja: "彼にしては丁寧すぎる" },
      { en: "Who uses this word?", ja: "こんな単語を使うのは誰？" },
    ],
    questions: Array.from({ length: questionCount }, (_, index) => validQuestion(index + 1)),
  };
}

/** 参加者。レベルは呼び出し側が指定する（hintEnの件数がレベルで変わることを確かめるため） */
export function playersOf(levels: readonly number[], hostIndex = 0): Player[] {
  return levels.map((level, index) => ({
    id: `p${index + 1}`,
    name: `Player${index + 1}`,
    level: level as Player["level"],
    icon: fallbackPlayerIconId(`p${index + 1}`),
    connected: true,
    isHost: index === hostIndex,
  }));
}
