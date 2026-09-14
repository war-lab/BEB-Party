// 検証テストとモジュールテスト用のお題データ。
// 本番のパックとして扱われないよう content/ の外に置く（12のテスト観点）。
//
// 基準となる正常なパック（validPack）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import { MIN_ITEMS, type BlindRoomPack, type ItemDefinition, type ItemSet, type Tier } from "@beb/shared-blindroom";
import { fallbackPlayerIconId, type Player } from "@beb/shared-core";

function itemsOf(prefix: string, count: number): ItemDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}_${index + 1}`,
    en: `${prefix} ${index + 1}`,
    ja: `${prefix}の${index + 1}`,
    icon: `${prefix}_${index + 1}`,
  }));
}

/** 枠型のhint。完成文にしない（12の検証11） */
function hints(): string[] {
  return [
    "Put the ... in the top-left corner.",
    "The ... is next to the ...",
    "The ... is under the ...",
    "There is nothing in the ... row.",
  ];
}

export function validItemSet(tier: Tier, count: number = MIN_ITEMS): ItemSet {
  const prefix = tier === "easy" ? "easy" : "hard";
  return {
    id: `set_${tier}`,
    tier,
    describerHints: hints(),
    items: itemsOf(prefix, count),
  };
}

export function validPack(): BlindRoomPack {
  return {
    id: "fixture_pack",
    title: "Fixture Pack",
    keyExpressions: [
      { en: "Which row is it in?", ja: "どの段？" },
      { en: "Left or right?", ja: "左？右？" },
      { en: "Say that again, please.", ja: "もう一度お願い" },
    ],
    itemSets: [validItemSet("easy"), validItemSet("standard")],
  };
}

/** 参加者。レベルは呼び出し側が指定する（アイテムセットとhintEnの件数がレベルで変わるため） */
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
