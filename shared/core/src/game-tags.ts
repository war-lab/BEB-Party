// ゲームの遊び方の形を表すタグ。ロビーのゲーム一覧に出し、選ぶ前に形が分かるようにする（基本設計/05）。
//
// 語彙を共通コアに固定して持つのは、全ゲームが同じ語と同じ並びで表示されるようにするためである。
// ゲームごとに自由な文字列を持たせると「協力」「協力型」「みんなで」のように表記が割れ、一覧で比べられない。
// 語彙は遊び方の形の一般語であり、特定のゲームの概念を含まない（不変条件4）。

/** 遊び方の形。各ゲームはこのうち1つだけを持つ */
export const FORMAT_TAGS = ["solo", "team", "coop", "faction"] as const;
/** 形に加えて付ける性質。持たなくてもよい */
export const TRAIT_TAGS = ["hidden"] as const;

export type FormatTag = (typeof FORMAT_TAGS)[number];
export type TraitTag = (typeof TRAIT_TAGS)[number];
export type GameTag = FormatTag | TraitTag;

/** 表示の文言。並びは一覧に出す順（形が先、性質が後） */
export const GAME_TAG_LABELS: Readonly<Record<GameTag, string>> = {
  // 1人ずつ点を競う
  solo: "個人戦",
  // チームの合計で競う
  team: "チーム戦",
  // 全員で1つの勝敗を目指し、個人の得点を持たない
  coop: "協力",
  // 役割の違う陣営に分かれて勝敗を争う（人数の揃ったチームではない）
  faction: "陣営戦",
  // 自分以外の役割や所属が伏せられている
  hidden: "正体隠匿",
};

const ORDER: readonly GameTag[] = [...FORMAT_TAGS, ...TRAIT_TAGS];

export function isFormatTag(tag: GameTag): tag is FormatTag {
  return (FORMAT_TAGS as readonly string[]).includes(tag);
}

/** タグを表示の順に並べる。重複は1つにまとめる */
export function sortGameTags(tags: readonly GameTag[]): GameTag[] {
  return ORDER.filter((tag) => tags.includes(tag));
}
