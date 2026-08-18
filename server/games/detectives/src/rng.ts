// シード付き擬似乱数。共通コアが注入するseedから、同じ配役と同じ犯人を再現できるようにする
// （基本設計/05のゲームモジュールの呼び出し規約）。Math.random()は使わない。

/**
 * mulberry32。32bitのseedから[0,1)の値を返す。
 *
 * 暗号用途ではない。配役のシャッフルと犯人抽選にしか使わないため、
 * 再現性と分布の素直さだけを要件とする。
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yatesシャッフル。入力を破壊しない */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** 候補から1つ選ぶ。候補が空なら undefined */
export function pickOne<T>(items: readonly T[], random: () => number): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return items[Math.floor(random() * items.length)];
}

/**
 * 重みつきで1つ選ぶ。重みは正の数とし、0以下は1として扱う。
 *
 * 候補を絞り込む方式と違い、どの候補も確率0にならない。
 * 「選ばれない候補」が公開情報から特定できる状況を作らないために使う。
 */
export function pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number, random: () => number): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  const weights = items.map((item) => Math.max(1, weightOf(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    threshold -= weights[index] as number;
    if (threshold < 0) {
      return items[index];
    }
  }
  // 浮動小数の丸めで抜けた場合の保険
  return items[items.length - 1];
}
