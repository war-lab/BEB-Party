// シード付き擬似乱数。共通コアが注入するseedから、同じ結果を再現できるようにする
// （基本設計/05のゲームモジュールの呼び出し規約）。ゲームモジュールはMath.random()を使わない。
//
// ここに置く理由は、seedを注入するのが共通コアであり、注入する側が乱数の実装を持つのが
// 素直だからである。ゲーム固有の概念を含まないため不変条件4には触れない。
//
// 候補の選び方（1つ選ぶ・重みつきで選ぶ）は利用者が1本しかないため、
// ここへは上げずゲームモジュール側に置く（先回りの共通化はしない。基本設計/05）。

/**
 * mulberry32。32bitのseedから[0,1)の値を返す。
 *
 * 暗号用途ではない。抽選とシャッフルにしか使わないため、
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
