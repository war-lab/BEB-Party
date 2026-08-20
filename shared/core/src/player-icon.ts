// プレイヤーアイコンの正本。ゲーム固有の概念を持たないため共通コアに置く（不変条件4、ADR-0009）
//
// プロトコルと `state` に載るのはID（`PlayerIconId`）だけであり、絵文字は載せない。
// 絵文字は表示のための対応表であって、アイコンの同一性はIDが持つ。
// アイコンを生成画像に差し替える場合も、変わるのはクライアントの表示層だけで済む（ADR-0022）。

/** アイコン1件の定義。`emoji` と `labelJa` を読むのはクライアントのみ */
export interface PlayerIconDefinition {
  id: string;
  /** 表示に使う絵文字。サーバはこの値を扱わない */
  emoji: string;
  /** 読み上げ・ツールチップ用の名称 */
  labelJa: string;
}

/**
 * 選択肢の一覧。30件とする。
 *
 * 5〜6人の部屋で重複を避けられ、かつスマホの1画面に収まる数を上限とした。
 * 並び順は選択画面の表示順であり、IDは並び順に依存しない。
 * 絵文字は端末のシステムフォントで描かれるため、収録が古く描画が安定しているものを選ぶ。
 */
export const PLAYER_ICONS = [
  { id: "cat", emoji: "🐱", labelJa: "ねこ" },
  { id: "dog", emoji: "🐶", labelJa: "いぬ" },
  { id: "fox", emoji: "🦊", labelJa: "きつね" },
  { id: "bear", emoji: "🐻", labelJa: "くま" },
  { id: "panda", emoji: "🐼", labelJa: "パンダ" },
  { id: "rabbit", emoji: "🐰", labelJa: "うさぎ" },
  { id: "hamster", emoji: "🐹", labelJa: "ハムスター" },
  { id: "mouse", emoji: "🐭", labelJa: "ねずみ" },
  { id: "tiger", emoji: "🐯", labelJa: "とら" },
  { id: "lion", emoji: "🦁", labelJa: "ライオン" },
  { id: "pig", emoji: "🐷", labelJa: "ぶた" },
  { id: "cow", emoji: "🐮", labelJa: "うし" },
  { id: "monkey", emoji: "🐵", labelJa: "さる" },
  { id: "koala", emoji: "🐨", labelJa: "コアラ" },
  { id: "frog", emoji: "🐸", labelJa: "かえる" },
  { id: "chick", emoji: "🐤", labelJa: "ひよこ" },
  { id: "penguin", emoji: "🐧", labelJa: "ペンギン" },
  { id: "owl", emoji: "🦉", labelJa: "ふくろう" },
  { id: "unicorn", emoji: "🦄", labelJa: "ユニコーン" },
  { id: "dragon", emoji: "🐲", labelJa: "ドラゴン" },
  { id: "octopus", emoji: "🐙", labelJa: "たこ" },
  { id: "whale", emoji: "🐳", labelJa: "くじら" },
  { id: "dolphin", emoji: "🐬", labelJa: "いるか" },
  { id: "crab", emoji: "🦀", labelJa: "かに" },
  { id: "bee", emoji: "🐝", labelJa: "はち" },
  { id: "butterfly", emoji: "🦋", labelJa: "ちょう" },
  { id: "dinosaur", emoji: "🦖", labelJa: "きょうりゅう" },
  { id: "robot", emoji: "🤖", labelJa: "ロボット" },
  { id: "alien", emoji: "👽", labelJa: "うちゅうじん" },
  { id: "ghost", emoji: "👻", labelJa: "おばけ" },
] as const satisfies readonly PlayerIconDefinition[];

/** 一覧に載っているIDのみを受理する。未知の値は `join` を不正として弾く（基本設計/03） */
export type PlayerIconId = (typeof PLAYER_ICONS)[number]["id"];

export function isPlayerIconId(value: unknown): value is PlayerIconId {
  return typeof value === "string" && PLAYER_ICONS.some((icon) => icon.id === value);
}

/**
 * `join` にアイコンが無いときに割り当てるID。
 *
 * 旧SPAを開いたままのタブは `icon` を送らない。全員を同じアイコンにすると見分けがつかないため、
 * playerIdから決まる値を割り当てる（参加順に依存しないので、再接続でも同じ値になる）。
 */
export function fallbackPlayerIconId(seed: string): PlayerIconId {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100_000;
  }
  return PLAYER_ICONS[hash % PLAYER_ICONS.length]!.id;
}

/** IDから絵文字を引く。未知のIDは一覧の先頭にフォールバックする（表示を欠落させない） */
export function playerIconEmoji(iconId: string): string {
  return (PLAYER_ICONS.find((icon) => icon.id === iconId) ?? PLAYER_ICONS[0]).emoji;
}
