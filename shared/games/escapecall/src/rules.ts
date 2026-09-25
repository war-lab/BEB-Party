// 規則の意味（基本設計/13_ESCAPECALLゲームモジュール.md の規則、ADR-0027）。
//
// 規則の意味はコードに置き、コンテンツは言い回しだけを持つ。規則を足すときはここに規則IDと作用を足し、
// 全パックに言い回しを足す（言い回しが欠けた規則IDは validate:content が落とす）。
import { colorOf, shapeOf, type ColorId, type ShapeId, type SymbolId } from "./symbols";

export const RULE_IDS = ["skip_color", "skip_shape", "reverse", "swap_ends", "add_one"] as const;

export type RuleId = (typeof RULE_IDS)[number];

export function isRuleId(value: unknown): value is RuleId {
  return typeof value === "string" && (RULE_IDS as readonly string[]).includes(value);
}

/**
 * 規則の作用先。記号に作用する規則は並びを変え、数字に作用する規則は置き換え後の数字列を変える。
 * 生成時に記号の規則を前に並べ、「書かれた順に適用する」と作用の順を常に一致させる（13の断片）。
 */
export const RULE_TARGET: Record<RuleId, "symbol" | "digit"> = {
  skip_color: "symbol",
  skip_shape: "symbol",
  reverse: "symbol",
  swap_ends: "digit",
  add_one: "digit",
};

/** 並びから記号を除く規則。錠3では1つまでとする（並びが1画面の横幅に収まらなくなるため） */
export const SKIP_RULE_IDS: readonly RuleId[] = ["skip_color", "skip_shape"];

/** skip_color と skip_shape が並びに混ぜる、除かれる記号の数 */
export const SKIPPED_SYMBOL_COUNT = 2;

/** 規則1件。skip_color は色、skip_shape は形を param に持つ */
export type RuleSpec =
  | { ruleId: "skip_color"; param: ColorId }
  | { ruleId: "skip_shape"; param: ShapeId }
  | { ruleId: "reverse" | "swap_ends" | "add_one"; param?: undefined };

/** 記号がこの規則で除かれる対象か。除く規則以外は常に false */
export function isSkippedBy(rule: RuleSpec, symbol: SymbolId): boolean {
  if (rule.ruleId === "skip_color") {
    return colorOf(symbol) === rule.param;
  }
  if (rule.ruleId === "skip_shape") {
    return shapeOf(symbol) === rule.param;
  }
  return false;
}

export function applySymbolRule(rule: RuleSpec, symbols: readonly SymbolId[]): SymbolId[] {
  switch (rule.ruleId) {
    case "skip_color":
    case "skip_shape":
      return symbols.filter((symbol) => !isSkippedBy(rule, symbol));
    case "reverse":
      return [...symbols].reverse();
    default:
      return [...symbols];
  }
}

export function applyDigitRule(rule: RuleSpec, digits: readonly string[]): string[] {
  switch (rule.ruleId) {
    case "swap_ends": {
      if (digits.length < 2) {
        return [...digits];
      }
      const result = [...digits];
      const first = result[0] as string;
      result[0] = result[result.length - 1] as string;
      result[result.length - 1] = first;
      return result;
    }
    case "add_one":
      return digits.map((digit) => String((Number(digit) + 1) % 10));
    default:
      return [...digits];
  }
}

/**
 * 答えを計算する。並びに記号の規則を順に適用し、対応表で数字に置き換え、数字の規則を順に適用する。
 *
 * サーバの照合とユニットテストが同じこの関数を使う（13の断片）。
 * 対応表に無い記号が残った場合は undefined を返す（断片が足りない状態）。
 */
export function computeCode(
  order: readonly SymbolId[],
  rules: readonly RuleSpec[],
  map: ReadonlyMap<SymbolId, string>,
): string | undefined {
  let symbols = [...order];
  for (const rule of rules) {
    if (RULE_TARGET[rule.ruleId] === "symbol") {
      symbols = applySymbolRule(rule, symbols);
    }
  }
  const digits: string[] = [];
  for (const symbol of symbols) {
    const digit = map.get(symbol);
    if (digit === undefined) {
      return undefined;
    }
    digits.push(digit);
  }
  let result = digits;
  for (const rule of rules) {
    if (RULE_TARGET[rule.ruleId] === "digit") {
      result = applyDigitRule(rule, result);
    }
  }
  return result.join("");
}
