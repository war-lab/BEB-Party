// 前方推論の不動点計算（基本設計/06_推論エンジンと検証アルゴリズム.md）。
import { EngineError, type Rule, type Saturation } from "./types";

/**
 * 自己参照規則（requiresに自分のyieldsを含む）を検出する。
 *
 * この規則は「結論が既に成立しているときだけ発火し、何も新しく導かない」ため、
 * 事件データの記述ミスでしかない。単調な不動点計算では無限ループにならないが、
 * 放置すると作者は「書いたはずの規則が効いていない」ことに気付けないためエラーとする。
 */
function assertNoSelfReference(rules: Rule[]): void {
  for (const rule of rules) {
    if (rule.requires.includes(rule.yields)) {
      throw new EngineError(`規則 ${rule.id} のrequiresが自身のyields(${rule.yields})を含む（自己参照）`);
    }
  }
}

/**
 * initialから到達できるシンボルの集合を求める。
 *
 * requiresがすべて満たされた規則を発火させ、発火する規則が無くなるまで繰り返す。
 * 出力は規則の評価順に依存しない（`fired` の並び順のみ評価順に依存する）。
 */
export function saturate(initial: Set<string>, rules: Rule[]): Saturation {
  assertNoSelfReference(rules);

  const reached = new Set(initial);
  const fired: string[] = [];
  const support = new Map<string, string[]>();
  const firedIds = new Set<string>();

  // 1反復につき最低1つの規則が新たに発火するため、反復回数は規則数を超えない。
  // 超えた場合は実装の不具合であり、無限ループにするより落とす（06の停止性）
  const maxIterations = rules.length;
  for (let iteration = 0; ; iteration += 1) {
    if (iteration > maxIterations) {
      throw new EngineError(`推論の反復回数が上限(${maxIterations})を超えた`);
    }

    let firedInThisIteration = false;
    for (const rule of rules) {
      if (firedIds.has(rule.id)) {
        continue;
      }
      if (!rule.requires.every((symbol) => reached.has(symbol))) {
        continue;
      }
      firedIds.add(rule.id);
      fired.push(rule.id);
      firedInThisIteration = true;
      if (!reached.has(rule.yields)) {
        reached.add(rule.yields);
        support.set(rule.yields, [...rule.requires]);
      }
    }

    if (!firedInThisIteration) {
      return { reached, fired, support };
    }
  }
}

/**
 * `drop` のシンボルをinitialから除くと `goal` へ到達しなくなるかを判定する。
 *
 * 検証2（全員必須）と検証5（未使用なし）はどちらもこの関数で表現する。
 */
export function isRequired(initial: Set<string>, rules: Rule[], goal: string, drop: string[]): boolean {
  const reduced = new Set(initial);
  for (const symbol of drop) {
    reduced.delete(symbol);
  }
  return !saturate(reduced, rules).reached.has(goal);
}

/** `explain` の戻り値 */
export interface Derivation {
  /** 導出に使った規則のid（昇順） */
  ruleIds: string[];
  /** 導出の末端にある、規則で導かれなかったシンボル（昇順） */
  leaves: string[];
}

/**
 * 到達したシンボルの導出元を推移的に辿る。
 *
 * 規則のrequiresに他の規則のyieldsが含まれる場合、その規則のrequiresも展開して末端まで辿る。
 * 展開を行わないと、多段の推論を使うデータで直接のrequiresしか数えられない（06の検証3）。
 */
export function explain(saturation: Saturation, rules: Rule[], symbol: string): Derivation {
  const ruleIds = new Set<string>();
  const leaves = new Set<string>();
  const visited = new Set<string>();
  const stack = [symbol];

  const firedIds = new Set(saturation.fired);

  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (!saturation.support.has(current)) {
      // 規則で導かれていない = initial由来のシンボル
      if (saturation.reached.has(current)) {
        leaves.add(current);
      }
      continue;
    }

    // 同じシンボルを導く規則が複数発火している場合は、そのすべてを導出元として扱う
    for (const rule of rules) {
      if (rule.yields === current && firedIds.has(rule.id)) {
        ruleIds.add(rule.id);
        stack.push(...rule.requires);
      }
    }
  }

  return {
    ruleIds: [...ruleIds].sort(),
    leaves: [...leaves].sort(),
  };
}
