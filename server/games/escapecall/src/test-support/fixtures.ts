// 検証テストとモジュールテスト用の舞台パックと参加者。
// 本番のパックとして扱われないよう content/ の外に置く（13のテスト観点）。
//
// 基準となる正常なパック（validPack）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import type { EscapeCallPack } from "@beb/shared-escapecall";
import { fallbackPlayerIconId, type Player } from "@beb/shared-core";

export function validPack(): EscapeCallPack {
  return {
    id: "fixture",
    title: "Fixture",
    scene: { titleEn: "Fixture", titleJa: "フィクスチャ", introEn: "Open the locks.", introJa: "錠を開ける" },
    lockLabels: [
      { en: "Box", ja: "箱" },
      { en: "Door", ja: "扉" },
      { en: "Gate", ja: "門" },
    ],
    keyExpressions: [
      { en: "What is the first symbol?", ja: "最初の記号は？" },
      { en: "What number is it?", ja: "何番？" },
      { en: "Say that again, please.", ja: "もう一度お願い" },
    ],
    rulePhrases: {
      skip_color: { easy: "Skip the {color} ones.", standard: "Ignore every {color} symbol.", ja: "{color}は飛ばす" },
      skip_shape: { easy: "Skip the {shape}s.", standard: "Leave out every {shape}.", ja: "{shape}は飛ばす" },
      reverse: { easy: "Right to left.", standard: "Read it backwards.", ja: "右から左へ" },
      swap_ends: { easy: "Swap the ends.", standard: "Switch the first and last.", ja: "両端を入れ替える" },
      add_one: { easy: "Add one.", standard: "Make each number bigger.", ja: "1を足す" },
    },
  };
}

/** 参加者。レベルは呼び出し側が指定する（断片の割り当てと規則の言い回しがレベルで変わるため） */
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
