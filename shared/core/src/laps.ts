// 周回数の選択肢。説明役を全員（全ペア）が何周務めるかをロビーの select で選ぶ。
//
// DON'T SAY IT・BLIND ROOMで同じ形の定数を持っており、TWO-HEADED SPEAKERで3つ目のコピーになるため
// 共通コアへ移した（ADR-0020の条件2、基本設計/16の設定）。扱うのは選択肢のidと周回数と表示文言だけで、
// 役やお題などゲーム固有の語彙を含まない（不変条件4）。
//
// 既定の周回数はゲームごとに違う（DON'T SAY IT・BLIND ROOMは1周、TWO-HEADED SPEAKERは2周）ため、
// 既定値はここに持たせず、lapsFromId の引数で各ゲームが渡す。

/** キーが `settings.laps` に入る値である */
export const LAPS_OPTIONS = {
  "1": { laps: 1, labelJa: "1周（全員が1回ずつ説明）" },
  "2": { laps: 2, labelJa: "2周（全員が2回ずつ説明）" },
} as const;

export type LapsId = keyof typeof LAPS_OPTIONS;

export const LAPS_IDS = Object.keys(LAPS_OPTIONS) as LapsId[];

/** 周回数の上限。山札の下限はこの値から導く */
export const MAX_LAPS = Math.max(...Object.values(LAPS_OPTIONS).map((option) => option.laps));

export function isLapsId(value: unknown): value is LapsId {
  return typeof value === "string" && Object.hasOwn(LAPS_OPTIONS, value);
}

/** 周回数を引く。未知の値は fallback へ落として進行を止めない */
export function lapsFromId(id: unknown, fallback: LapsId): number {
  return isLapsId(id) ? LAPS_OPTIONS[id].laps : LAPS_OPTIONS[fallback].laps;
}
