// 舞台パックのスキーマ。このファイルの型定義がスキーマの正本である（基本設計/13_ESCAPECALLゲームモジュール.md）。
//
// 錠の答え・並び・対応表はコンテンツに持たない。startでseedから生成する（ADR-0027）。
// コンテンツが持つのは、規則の言い回し、舞台の文言、質問に使う言い回しだけである。
import type { Level } from "@beb/shared-core";
import { RULE_TARGET, type RuleId, type RuleSpec } from "./rules";
import { COLORS, SHAPES } from "./symbols";

export interface KeyExpression {
  en: string;
  ja: string;
}

export interface SceneText {
  titleEn: string;
  titleJa: string;
  introEn: string;
  introJa: string;
}

export interface LockLabel {
  en: string;
  ja: string;
}

/** 規則1件の言い回し。easy はレベル1〜2、standard はレベル3〜5の規則を持つ人へ配る */
export interface RulePhrase {
  easy: string;
  standard: string;
  ja: string;
}

/** 舞台パック1本。content/escapecall/<id>.json の中身。ロビーで選ぶ単位はパックである */
export interface EscapeCallPack {
  id: string;
  title: string;
  scene: SceneText;
  /** 錠の名前。ちょうど3件 */
  lockLabels: LockLabel[];
  keyExpressions: KeyExpression[];
  rulePhrases: Record<RuleId, RulePhrase>;
}

/** 色名の穴。skip_color の文だけが持つ */
export const COLOR_PLACEHOLDER = "{color}";
/** 形名の穴。skip_shape の文だけが持つ */
export const SHAPE_PLACEHOLDER = "{shape}";

export const MIN_KEY_EXPRESSIONS = 3;

export const PACK_ID_PATTERN = /^[a-z0-9_]{1,16}$/;

/** 規則が要求する穴。検証6〜8と、置き換えの両方がこの表を見る */
export function placeholderOf(ruleId: RuleId): string | null {
  if (ruleId === "skip_color") {
    return COLOR_PLACEHOLDER;
  }
  if (ruleId === "skip_shape") {
    return SHAPE_PLACEHOLDER;
  }
  return null;
}

/** 文字列に部分文字列が現れる回数 */
export function countOccurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

/** 規則を持つ人のレベルから言い回しの段を決める（13のレベル差の吸収の第2層） */
export function phraseTierFor(level: Level): "easy" | "standard" {
  return level <= 2 ? "easy" : "standard";
}

function fill(template: string, rule: RuleSpec, language: "en" | "ja"): string {
  if (rule.ruleId === "skip_color") {
    return template.replace(COLOR_PLACEHOLDER, COLORS[rule.param][language]);
  }
  if (rule.ruleId === "skip_shape") {
    return template.replace(SHAPE_PLACEHOLDER, SHAPES[rule.param][language]);
  }
  return template;
}

/**
 * 規則の英文を組み立てる。日本語の補足はレベル1〜2のときだけ付ける。
 * 色と形の名前はコードの定義から入れる。記号の描画と同じ定義から出すためである（13のコンテンツ形式）。
 */
export function ruleTextFor(
  phrases: Record<RuleId, RulePhrase>,
  rule: RuleSpec,
  level: Level,
): { textEn: string; textJa?: string } {
  const phrase = phrases[rule.ruleId];
  const tier = phraseTierFor(level);
  const textEn = fill(phrase[tier], rule, "en");
  return tier === "easy" ? { textEn, textJa: fill(phrase.ja, rule, "ja") } : { textEn };
}

/** 振り返り用の日本語。結果画面では全員に出す（13の結果） */
export function ruleTextJa(phrases: Record<RuleId, RulePhrase>, rule: RuleSpec): string {
  return fill(phrases[rule.ruleId].ja, rule, "ja");
}

/** 規則の作用先の表示。遊び方と検証の説明に使う */
export function isSymbolRule(ruleId: RuleId): boolean {
  return RULE_TARGET[ruleId] === "symbol";
}
