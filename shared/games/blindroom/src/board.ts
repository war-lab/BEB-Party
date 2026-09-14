// 盤面の表現と照合（基本設計/12_BLINDROOMゲームモジュール.md の進行の要点）。
//
// 照合の対象はアイテムIDだけであり、enもjaも判定に使わない（不変条件1）。
// 見本の生成もここに置く。生成物が満たす不変条件はユニットテストで固定する（ADR-0024）。
//
// マス数は盤面の広さで変わる（board-size.ts）。この層は渡されたマス数に従うだけとし、
// 広さの一覧を知らない。
import { shuffle } from "@beb/shared-core";

/**
 * 見本に置くアイテム数。聞き手が置ける上限も同じ値とする。
 *
 * 盤面の広さによらず一定にするのは、ラウンドごとの満点を揃えるためである。
 * 広さが変わると難度は上がるが、取り得る点は変わらない（12の進行の要点）。
 */
export const PLACE_COUNT = 5;

/** 盤面。添字を左上から右下へ行優先で対応させる。空きマスは null */
export type Board = (string | null)[];

/** 空の盤面 */
export function emptyBoard(cellCount: number): Board {
  return Array.from({ length: cellCount }, () => null);
}

/** 受信値が盤面の形をしているか。中身のidが実在するかは呼び出し側が見る */
export function isBoard(value: unknown, cellCount: number): value is Board {
  return (
    Array.isArray(value) &&
    value.length === cellCount &&
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
  for (let index = 0; index < sample.length; index += 1) {
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
export function generateSample(itemIds: readonly string[], random: () => number, cellCount: number): Board {
  const items = shuffle(itemIds, random).slice(0, PLACE_COUNT);
  const cells = shuffle(
    Array.from({ length: cellCount }, (_, index) => index),
    random,
  ).slice(0, items.length);

  const board = emptyBoard(cellCount);
  for (let index = 0; index < items.length; index += 1) {
    const cell = cells[index];
    const item = items[index];
    if (cell !== undefined && item !== undefined) {
      board[cell] = item;
    }
  }
  return board;
}
