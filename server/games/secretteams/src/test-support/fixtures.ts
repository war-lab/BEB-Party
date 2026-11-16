// 検証テストとモジュールテスト用のテーマパック。
// 本番のパックとして扱われないよう content/ の外に置く（17のテスト観点）。
//
// 基準となる正常なパック（validPack）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import { fallbackPlayerIconId, type Level, type Player } from "@beb/shared-core";
import type { FamilySpec, SecretTeamsPack, ThemeSpec } from "@beb/shared-secretteams";

function theme(id: string, en: string, ja: string, words: string[]): ThemeSpec {
  return { id, en, ja, words: words.map((word) => ({ en: word, ja: `${ja}の${word}` })) };
}

export function validFamilies(): FamilySpec[] {
  return [
    {
      id: "water",
      themes: [
        theme("ocean", "Ocean", "海", ["whale", "wave", "boat", "shell", "salt", "island"]),
        theme("river", "River", "川", ["bridge", "salmon", "canoe", "waterfall", "otter", "stone"]),
        theme("lake", "Lake", "湖", ["duck", "swan", "cabin", "fishing rod", "frog", "rowboat"]),
      ],
    },
    {
      id: "sky",
      themes: [
        theme("space", "Space", "宇宙", ["rocket", "moon", "planet", "astronaut", "alien", "comet"]),
        theme("weather", "Weather", "天気", ["rain", "snow", "cloud", "umbrella", "thunder", "rainbow"]),
        theme("birds", "Birds", "鳥", ["nest", "egg", "feather", "wing", "owl", "parrot"]),
      ],
    },
    {
      id: "building",
      themes: [
        theme("school", "School", "学校", ["teacher", "desk", "homework", "test", "chalk", "lunch box"]),
        theme("hospital", "Hospital", "病院", ["doctor", "nurse", "medicine", "bandage", "ambulance", "x-ray"]),
        theme("airport", "Airport", "空港", ["passport", "pilot", "suitcase", "ticket", "gate", "runway"]),
      ],
    },
  ];
}

export function validPack(): SecretTeamsPack {
  return {
    id: "fixture_pack",
    title: "テスト用のテーマ",
    keyExpressions: [
      { en: "You can ... it.", ja: "それは…できる" },
      { en: "Can you eat it?", ja: "それは食べられる？" },
      { en: "Is it alive?", ja: "それは生きている？" },
      { en: "Maybe.", ja: "たぶんね" },
      { en: "I think you're on my team.", ja: "あなたは味方だと思う" },
    ],
    families: validFamilies(),
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
