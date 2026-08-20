// プレイヤーアイコンの正本。ゲーム固有の概念を持たないため共通コアに置く（不変条件4、ADR-0009）
//
// プロトコルと `state` に載るのはID（`PlayerIconId`）だけであり、見た目は載せない。
// 画像はIDから引く（`client/public/player-icons/<id>.png`）。
// 見た目を差し替える場合も、変わるのはクライアントの表示層だけで済む（ADR-0022）。

/** アイコン1件の定義。`labelJa` を読むのはクライアントのみ */
export interface PlayerIconDefinition {
  id: string;
  /** 読み上げ・ツールチップ用の名称 */
  labelJa: string;
}

/**
 * 選択肢の一覧。30件とする。
 *
 * 5〜6人の部屋で重複を避けられ、かつスマホの1画面に収まる数を上限とした。
 * 並び順は選択画面の表示順であり、IDは並び順に依存しない。
 * 人物・動物・その他の順に並べ、同じ系統が隣に来るようにする。
 */
export const PLAYER_ICONS = [
  { id: "dark-hair", labelJa: "くろかみ" },
  { id: "smile", labelJa: "えがお" },
  { id: "glasses", labelJa: "めがね" },
  { id: "sunglasses", labelJa: "サングラス" },
  { id: "red-cap", labelJa: "あかいキャップ" },
  { id: "beanie", labelJa: "ニットぼう" },
  { id: "headphones", labelJa: "ヘッドホン" },
  { id: "mustache", labelJa: "ひげ" },
  { id: "spiky", labelJa: "ツンツンあたま" },
  { id: "bob", labelJa: "ボブ" },
  { id: "purple-cap", labelJa: "むらさきキャップ" },
  { id: "short-hair", labelJa: "ショートヘア" },
  { id: "cat", labelJa: "ねこ" },
  { id: "dog", labelJa: "いぬ" },
  { id: "rabbit", labelJa: "うさぎ" },
  { id: "bear", labelJa: "くま" },
  { id: "frog", labelJa: "かえる" },
  { id: "penguin", labelJa: "ペンギン" },
  { id: "owl", labelJa: "ふくろう" },
  { id: "fox", labelJa: "きつね" },
  { id: "pig", labelJa: "ぶた" },
  { id: "hamster", labelJa: "ハムスター" },
  { id: "blob", labelJa: "ぷにぷに" },
  { id: "ghost", labelJa: "おばけ" },
  { id: "robot", labelJa: "ロボット" },
  { id: "alien", labelJa: "うちゅうじん" },
  { id: "dragon", labelJa: "ドラゴン" },
  { id: "crown", labelJa: "おうかん" },
  { id: "book", labelJa: "ほん" },
  { id: "dice", labelJa: "サイコロ" },
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

/** IDから読み上げ用の名称を引く。未知のIDは一覧の先頭にフォールバックする */
export function playerIconLabel(iconId: string): string {
  return (PLAYER_ICONS.find((icon) => icon.id === iconId) ?? PLAYER_ICONS[0]).labelJa;
}
