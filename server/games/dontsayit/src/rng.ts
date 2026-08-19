// シード付き擬似乱数。共通コアが注入するseedから、同じ説明者順と同じ山札を再現できるようにする
// （基本設計/05のゲームモジュールの呼び出し規約）。Math.random()は使わない。
//
// 重複の記録: server/games/detectives/src/rng.ts と同一の実装である。
// 抽出するかどうかは実装計画のPR-5で判断する。先回りの共通化はしない。

/**
 * mulberry32。32bitのseedから[0,1)の値を返す。
 *
 * 暗号用途ではない。説明者順と山札のシャッフルにしか使わないため、
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
