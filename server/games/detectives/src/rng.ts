// 候補の選び方。DETECTIVES専用（犯人バリアントの抽選と質問テンプレートの抽選）。
//
// seed付き乱数そのもの（createRandom / shuffle）は共通コアにある（shared/core の rng.ts）。
// ここに残しているのは利用者がDETECTIVESだけの2つであり、
// 2本目以降で必要になった時点で共通コアへ上げるかを判断する（基本設計/05）。

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
