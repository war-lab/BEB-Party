// 検証テストとモジュールテスト用のお題データ。
// 本番のパックとして扱われないよう content/ の外に置く（10のテスト観点）。
//
// 基準となる正常なパック（validPack）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import { MIN_SETS, type GoalCard, type RankingItem, type RankingPack, type RankingSet } from "@beb/shared-ranking";
import { fallbackPlayerIconId, type Player } from "@beb/shared-core";

const ITEM_IDS = ["a", "b", "c", "d", "e"] as const;

function items(): RankingItem[] {
  return ITEM_IDS.map((id) => ({ id, en: `item-${id}`, ja: `項目${id}` }));
}

function hints(): string[] {
  return ["Hint one.", "Hint two.", "Hint three."];
}

/**
 * 難度構成 1,1,2,2,3,3 を満たし、検証11〜13を通る6枚。
 *
 * 全6枚は同時に達成できない（`b`を1位に置く目標と`a`を`b`より上に置く目標が両立しない）。
 * 同時達成の最大は4枚である（`b,a,c,d,e` の順で g2・g3・g4・g5 が成立する）。
 */
function goals(): GoalCard[] {
  return [
    { id: "g1", difficulty: 1, ja: "aをbより上にする", hintEn: hints(), goal: { type: "above", item: "a", than: "b" } },
    { id: "g2", difficulty: 1, ja: "cをdより上にする", hintEn: hints(), goal: { type: "above", item: "c", than: "d" } },
    { id: "g3", difficulty: 2, ja: "bを1位にする", hintEn: hints(), goal: { type: "top", item: "b", within: 1 } },
    { id: "g4", difficulty: 2, ja: "eを最下位にする", hintEn: hints(), goal: { type: "bottom", item: "e", within: 1 } },
    { id: "g5", difficulty: 3, ja: "cをちょうど3位にする", hintEn: hints(), goal: { type: "exact", item: "c", rank: 3 } },
    { id: "g6", difficulty: 3, ja: "aをちょうど5位にする", hintEn: hints(), goal: { type: "exact", item: "a", rank: 5 } },
  ];
}

export function validSet(suffix: number = 1): RankingSet {
  return {
    id: `set_${suffix}`,
    question: { en: "Which matters most?", ja: "一番効くのはどれか" },
    items: items(),
    goals: goals(),
    keyExpressions: [{ en: "I think X is more important than Y.", ja: "XはYより重要だと思う" }],
  };
}

export function validPack(setCount: number = MIN_SETS): RankingPack {
  return {
    id: "fixture_pack",
    title: "Fixture Pack",
    sets: Array.from({ length: setCount }, (_, index) => validSet(index + 1)),
  };
}

/** 参加者。レベルは呼び出し側が指定する（目標の割り当てがレベル順であることを確かめるため） */
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
