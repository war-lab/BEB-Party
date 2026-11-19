// 動画の配色と書体。アプリのデザイントークン（client/core/src/tokens.css）と同じ値を使う。
//
// トークンのCSSを直接読まずに写しているのは、Motion Canvasがカスタムプロパティを解釈しないためである。
// 値を変えるときは tokens.css を正本として揃える（[ビジュアルデザイン.md](../../../docs/ビジュアルデザイン.md)）。

export const COLOR = {
  ground: "#0d142e",
  ground2: "#131c42",
  sky: "#4ec9ff",
  skyDeep: "#1e8fe0",
  panel: "#f7f8fd",
  red: "#ff3d3d",
  redDeep: "#d42121",
  blue: "#2e7cf6",
  blueDeep: "#1b5cd6",
  yellow: "#ffc400",
  ink: "#161b33",
  inkSoft: "#4a5170",
  mist: "#b9c2e8",
} as const;

export const FONT = {
  /** 見出し。超極太のため大きく出すときだけ使う（tokens.cssの注記と同じ規則） */
  display: "Dela Gothic One",
  /** 小見出し・本文・字幕 */
  body: "M PLUS Rounded 1c",
} as const;

/** 動画の寸法。スマホで見る前提の縦 */
export const SIZE = { width: 1080, height: 1920 } as const;

/** 実画面のスクリーンショットの寸法（撮影時の viewport × deviceScaleFactor） */
export const SHOT = { width: 1080, height: 1920 } as const;

/** ゲームごとの識別色。選択画面のアイコンと合わせる */
export const GAME_ACCENT = {
  detectives: COLOR.sky,
  dontsayit: COLOR.red,
  ranking: COLOR.yellow,
  whowrotethis: COLOR.blue,
  // 4色が埋まっているため濃い空色を当てる。sky（DETECTIVES）とは明度で分かれる
  blindroom: COLOR.skyDeep,
  // 協力型で「開く」ことが主題のため、解錠の演出と同じ黄の濃い側ではなく赤の濃い側を当てる。
  // red（DON'T SAY IT）とは明度で分かれる
  escapecall: COLOR.redDeep,
  // 残りの色のうち、どのゲームにも当たっていない濃い青。blue（WHO WROTE THIS?）とは明度で分かれる
  secretrule: COLOR.blueDeep,
  // 以下のチーム戦3本で、トークンの明るい色（帯の上に濃い字を載せられる色）は使い切る。
  // 薄い紫がかった灰。どの原色とも色相で分かれる
  mindmeld: COLOR.mist,
  // 白。字幕の帯の上端の線と札の輪郭が最も明るく出る
  twoheaded: COLOR.panel,
  // 明るい色が残っていないため黄を共有する。黄のENGLISH RANKINGとは「秘密の目標を抱える」主題が近く、
  // 動画は1本ずつ見るものであり、題名が並んで出る場面が無い
  secretteams: COLOR.yellow,
} as const;

export type GameId = keyof typeof GAME_ACCENT;
