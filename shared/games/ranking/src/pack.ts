// お題データのスキーマ。このファイルの型定義がスキーマの正本である（基本設計/10_ENGLISHRANKINGゲームモジュール.md）。
// 推論エンジンを使わないため、検証は5項目の全順列（120通り）の総当たりと計数だけで足りる。

/** 順位づけの対象になる1項目 */
export interface RankingItem {
  id: string;
  /** 議論で使う語。画面では大きく出す */
  en: string;
  /** 意味の取り違えを防ぐ短い注記 */
  ja: string;
}

/**
 * 目標の述語。確定順位に対して真偽が決まる形に限る。
 *
 * 自由記述を許すと達成の判定に人の解釈が入り、サーバ権威が崩れる（不変条件5）。
 * 4種に閉じることで、判定を純粋関数で書ける。
 */
export type Goal =
  /** item を than より上位に置く */
  | { type: "above"; item: string; than: string }
  /** item を within 位以内に入れる */
  | { type: "top"; item: string; within: number }
  /** item を下から within 位以内に入れる */
  | { type: "bottom"; item: string; within: number }
  /** item をちょうど rank 位に置く */
  | { type: "exact"; item: string; rank: number };

/** 目標の難度。述語の型から導ける値を宣言としても持たせ、検証で一致を確かめる */
export type GoalDifficulty = 1 | 2 | 3;

/** 1人に配る目標カード */
export interface GoalCard {
  id: string;
  difficulty: GoalDifficulty;
  /** 目標の日本語文。読み違えると議論が噛み合わないため必須とする */
  ja: string;
  /**
   * この目標を主張するための英文の例。
   *
   * レベル1〜2へ3件、レベル3以上へ1件を渡す（10のレベル差の吸収）。
   * 収録は3件以上とし、渡す件数だけをレベルで変える。
   */
  hintEn: string[];
  goal: Goal;
}

export interface KeyExpression {
  en: string;
  ja: string;
}

/** 1ラウンド分のお題。5項目と6枚の目標カードの組 */
export interface RankingSet {
  id: string;
  question: { en: string; ja: string };
  items: RankingItem[];
  goals: GoalCard[];
  keyExpressions: KeyExpression[];
}

/** お題パック1本。content/ranking/<id>.json の中身。ロビーで選ぶ単位はパックである */
export interface RankingPack {
  id: string;
  title: string;
  sets: RankingSet[];
}

/** 1セットの項目数。全順列の総当たりを成立させるため固定する（10の検証4） */
export const ITEMS_PER_SET = 5;

/** 1セットの目標カード数。対応人数の上限6人に配る（10の検証5） */
export const GOALS_PER_SET = 6;

/**
 * 目標カード6枚の難度構成。
 *
 * 5人のときは難度3を1枚落として配るため、難度3を2枚持たせる（10の目標の割り当て）。
 * 昇順で持つのは、検証でソート済みの列と直接比較するためである。
 */
export const DIFFICULTY_SHAPE: readonly GoalDifficulty[] = [1, 1, 2, 2, 3, 3];

/**
 * パックが持つセット数の下限。
 *
 * 1ゲームで3セット使うため、同じ部屋で2ゲーム続けても重複しない下限として6を置く（10の検証2）。
 */
export const MIN_SETS = 6;

/** 収録する hintEn の下限。レベル1〜2へ3件渡す設計に合わせる（10の検証14） */
export const MIN_HINTS = 3;

/**
 * 項目の順位（1始まり）。含まれていなければ null。
 *
 * 確定順位は itemId の並びで表す。1位が先頭である。
 */
export function rankOf(ranking: readonly string[], itemId: string): number | null {
  const index = ranking.indexOf(itemId);
  return index === -1 ? null : index + 1;
}

/**
 * 目標が確定順位で達成されているか。
 *
 * 参照する項目が順位に含まれない場合は false を返す。
 * 検証7で参照の存在を保証しているため、通常の進行では起きない。
 */
export function achieves(goal: Goal, ranking: readonly string[]): boolean {
  const rank = rankOf(ranking, goal.item);
  if (rank === null) {
    return false;
  }
  switch (goal.type) {
    case "above": {
      const other = rankOf(ranking, goal.than);
      return other !== null && rank < other;
    }
    case "top":
      return rank <= goal.within;
    case "bottom":
      return ranking.length - rank + 1 <= goal.within;
    case "exact":
      return rank === goal.rank;
  }
}

/**
 * 述語の型から導く難度（10のレベル差の吸収の表）。
 *
 * カード側の宣言と一致することを検証9で確かめる。二重に持つのは、
 * 難度がコンテンツの意図として読めるようにするためである。
 */
export function difficultyOf(goal: Goal): GoalDifficulty {
  switch (goal.type) {
    case "above":
      return 1;
    case "top":
    case "bottom":
      return goal.within <= 1 ? 2 : 1;
    case "exact":
      return 3;
  }
}

/** 述語の同一性。同じ述語を持つ目標が2枚ないことを検証10で確かめる */
export function goalKey(goal: Goal): string {
  switch (goal.type) {
    case "above":
      return `above:${goal.item}>${goal.than}`;
    case "top":
      return `top:${goal.item}<=${goal.within}`;
    case "bottom":
      return `bottom:${goal.item}<=${goal.within}`;
    case "exact":
      return `exact:${goal.item}=${goal.rank}`;
  }
}

/** 項目の全順列。5項目で120通りであり、検証11〜13で総当たりする */
export function permutations(itemIds: readonly string[]): string[][] {
  if (itemIds.length <= 1) {
    return [[...itemIds]];
  }
  const result: string[][] = [];
  for (let index = 0; index < itemIds.length; index += 1) {
    const head = itemIds[index] as string;
    const rest = [...itemIds.slice(0, index), ...itemIds.slice(index + 1)];
    for (const tail of permutations(rest)) {
      result.push([head, ...tail]);
    }
  }
  return result;
}
