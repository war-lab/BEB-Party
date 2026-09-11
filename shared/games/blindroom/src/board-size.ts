// 盤面の広さ（基本設計/12_BLINDROOMゲームモジュール.md の盤面と配置数）。
//
// ロビーでホストが選ぶ。配置数と制限時間は広さによらず一定であり、変わるのはマスの数だけとする。
// 広いほど位置の自由度が上がり、説明で指定すべき情報が増える。

export interface BoardSize {
  columns: number;
  rows: number;
  labelJa: string;
}

/** 選べる広さ。キーが `settings.boardSizeId` に入る値である */
export const BOARD_SIZES = {
  intro: { columns: 3, rows: 3, labelJa: "入門 3×3" },
  standard: { columns: 4, rows: 3, labelJa: "標準 4×3" },
  advanced: { columns: 4, rows: 4, labelJa: "上級 4×4" },
} as const satisfies Record<string, BoardSize>;

export type BoardSizeId = keyof typeof BOARD_SIZES;

export const BOARD_SIZE_IDS = Object.keys(BOARD_SIZES) as BoardSizeId[];

/** 既定の広さ。3×3は配置5個に対して空きが4マスしかなく、当てずっぽうが当たりやすい */
export const DEFAULT_BOARD_SIZE_ID: BoardSizeId = "standard";

export function isBoardSizeId(value: unknown): value is BoardSizeId {
  return typeof value === "string" && Object.hasOwn(BOARD_SIZES, value);
}

/** 広さを引く。未知の値は既定へ落として進行を止めない */
export function boardSizeOf(id: string): BoardSize {
  return isBoardSizeId(id) ? BOARD_SIZES[id] : BOARD_SIZES[DEFAULT_BOARD_SIZE_ID];
}

/** マス数 */
export function cellCountOf(id: string): number {
  const size = boardSizeOf(id);
  return size.columns * size.rows;
}

/**
 * 段を指す英語。
 *
 * 3段は top / middle / bottom で足りるが、4段には「真ん中」が無いため序数で言う。
 * 説明者へ出す注記と遊び方がこの語を案内する。
 */
export function rowWordsEn(rows: number): string[] {
  if (rows <= 3) {
    return ["top", "middle", "bottom"].slice(0, rows);
  }
  const middle = Array.from({ length: rows - 2 }, (_, index) => ORDINALS[index + 1] ?? "next");
  return ["top", ...middle, "bottom"];
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth"];

/**
 * 横の位置を指す英語（`... from the left`）。
 *
 * 4列には「真ん中」が無い。列数によらず使える言い方を1つ持たせるため、序数で数える。
 */
export function columnOrdinalsEn(columns: number): string[] {
  return ORDINALS.slice(0, columns);
}
