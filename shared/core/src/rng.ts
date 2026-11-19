// シード付き擬似乱数。共通コアが注入するseedから、同じ結果を再現できるようにする
// （基本設計/05のゲームモジュールの呼び出し規約）。ゲームモジュールはMath.random()を使わない。
//
// ここに置く理由は、seedを注入するのが共通コアであり、注入する側が乱数の実装を持つのが
// 素直だからである。ゲーム固有の概念を含まないため不変条件4には触れない。
//
// 候補の選び方（1つ選ぶ・重みつきで選ぶ）は利用者が1本しかないため、
// ここへは上げずゲームモジュール側に置く（先回りの共通化はしない。基本設計/05）。

/**
 * seed。実行時は共通コアが128bit（32bit×4）を注入する（ADR-0036）。
 *
 * 数値の seed はテストと再現用の短い表記として残す。数値の seed は 32bit の mulberry32 になり、
 * 総当たりで状態を復元できるため、実行時には使わない。
 */
export type Seed = number | readonly [number, number, number, number];

/**
 * seed から [0,1) の値を返す乱数を作る。
 *
 * 128bit の seed は sfc32 で回す。32bit の状態では、公開された並び（説明の順番など）から
 * 2^32 通りを総当たりして状態を割り出し、同じ乱数列で作った秘密（チームの所属・山札の順）まで
 * 復元できた（ADR-0036）。128bit にするのは総当たりを不可能にするためであり、暗号学的な
 * 安全性を持たせるものではない。
 */
export function createRandom(seed: Seed): () => number {
  if (typeof seed !== "number") {
    return sfc32(seed);
  }
  return mulberry32(seed);
}

/** sfc32。128bit の状態を持つ。初期の出力の偏りを避けるため、最初の12回を捨てる */
function sfc32(seed: readonly [number, number, number, number]): () => number {
  let [a, b, c, d] = seed.map((word) => word >>> 0) as [number, number, number, number];
  const next = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i += 1) {
    next();
  }
  return () => next() / 4294967296;
}

/**
 * mulberry32。32bit の seed から [0,1) の値を返す。テストと再現用の数値の seed にだけ使う。
 * 既存のテストが同じ seed で同じ結果を期待しているため、出力は変えない
 */
function mulberry32(seed: number): () => number {
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
