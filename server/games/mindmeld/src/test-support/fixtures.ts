// 検証テストとモジュールテスト用のお題パック。
// 本番のパックとして扱われないよう content/ の外に置く（15のテスト観点）。
//
// 基準となる正常なパック（validPack）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import { fallbackPlayerIconId, type Level, type Player } from "@beb/shared-core";
import type { MindMeldPack, PromptSpec } from "@beb/shared-mindmeld";

export function validPrompts(): PromptSpec[] {
  return [
    { id: "kitchen", en: "Something in a kitchen", ja: "台所にあるもの" },
    { id: "yellow", en: "Something yellow", ja: "黄色いもの" },
    { id: "summer", en: "Something you think of in summer", ja: "夏といえば" },
    { id: "school", en: "Something at school", ja: "学校にあるもの" },
    { id: "zoo", en: "An animal at the zoo", ja: "動物園にいる動物" },
    { id: "bag", en: "Something in your bag", ja: "かばんの中にあるもの" },
    { id: "cold", en: "Something cold", ja: "冷たいもの" },
    { id: "ride", en: "Something you can ride", ja: "乗れるもの" },
    { id: "sky", en: "Something in the sky", ja: "空にあるもの" },
    { id: "beach", en: "Something at the beach", ja: "海辺にあるもの" },
    { id: "round", en: "Something round", ja: "丸いもの" },
    { id: "red", en: "Something red", ja: "赤いもの" },
  ];
}

export function validPack(): MindMeldPack {
  return {
    id: "fixture_pack",
    title: "テスト用のお題",
    prompts: validPrompts(),
    keyExpressions: [
      { en: "Three, two, one!", ja: "せーの！" },
      { en: "We matched!", ja: "そろった！" },
      { en: "So close!", ja: "惜しい！" },
      { en: "It's the same word.", ja: "同じ語" },
      { en: "They are different words.", ja: "別の語" },
    ],
  };
}

/** 参加者。全員つながっている状態で作る。レベルは levels で与える（既定は1〜5の繰り返し） */
export function playersOf(count: number, levels?: readonly Level[]): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player${index + 1}`,
    level: levels?.[index] ?? (((index % 5) + 1) as Level),
    icon: fallbackPlayerIconId(`p${index + 1}`),
    connected: true,
    isHost: index === 0,
  }));
}
