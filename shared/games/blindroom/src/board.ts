// 盤面の表現と照合（基本設計/12_BLINDROOMゲームモジュール.md の進行の要点）。
//
// 照合の対象はアイテムIDだけであり、enもjaも判定に使わない（不変条件1）。
// 見本の生成もここに置く。生成物が満たす不変条件はユニットテストで固定する（ADR-0024）。
import { shuffle } from "@beb/shared-core";

/** 盤面の一辺 */
export const GRID_SIZE = 3;

/** 盤面のマス数 */
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

/**
 * 見本に置くアイテム数。聞き手が置ける上限も同じ値とする。
 *
 * 5に固定するのはラウンドごとの満点を揃えるためである。説明者のレベルで変えると、
 * 聞き手が取れる最大点がラウンドごとに動く（12の進行の要点）。
 */
export const PLACE_COUNT = 5;

/** 盤面。添字0〜8を左上から右下へ行優先で対応させる。空きマスは null */
export type Board = (string | null)[];

/** 空の盤面 */
export function emptyBoard(): Board {
  return Array.from({ length: CELL_COUNT }, () => null);
}

/** 受信値が盤面の形をしているか。中身のidが実在するかは呼び出し側が見る */
export function isBoard(value: unknown): value is Board {
  return (
    Array.isArray(value) &&
    value.length === CELL_COUNT &&
    value.every((cell) => cell === null || typeof cell === "string")
  );
}

/** 置かれているアイテムの数 */
export function placedCount(board: Board): number {
  return board.filter((cell) => cell !== null).length;
}

/** 同じアイテムが2マス以上にあるか */
export function hasDuplicateItem(board: Board): boolean {
  const placed = board.filter((cell): cell is string => cell !== null);
  return new Set(placed).size !== placed.length;
}

/** 盤面に置かれているアイテムidの一覧（重複を除かない。出現順） */
export function placedItemIds(board: Board): string[] {
  return board.filter((cell): cell is string => cell !== null);
}

/**
 * 見本と聞き手の盤面を照合し、一致したマス数を返す。
 *
 * 採点の対象は見本でアイテムが置かれているマスだけとする。空白マスを含めると、
 * 何も置かずに待つだけで一致するマスが生まれる（12の採点）。
 */
export function countMatches(sample: Board, board: Board): number {
  let matched = 0;
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const expected = sample[index];
    if (expected !== null && expected !== undefined && board[index] === expected) {
      matched += 1;
    }
  }
  return matched;
}

/**
 * 見本を生成する。
 *
 * アイテムを PLACE_COUNT 個選び、マスを PLACE_COUNT 個選んで順に置く。
 * 配置の見た目に制約は課さない。1列に並ぶ配置も四隅へ散る配置も生成しうる（ADR-0024）。
 */
export function generateSample(itemIds: readonly string[], random: () => number): Board {
  const items = shuffle(itemIds, random).slice(0, PLACE_COUNT);
  const cells = shuffle(
    Array.from({ length: CELL_COUNT }, (_, index) => index),
    random,
  ).slice(0, items.length);

  const board = emptyBoard();
  for (let index = 0; index < items.length; index += 1) {
    const cell = cells[index];
    const item = items[index];
    if (cell !== undefined && item !== undefined) {
      board[cell] = item;
    }
  }
  return board;
}
