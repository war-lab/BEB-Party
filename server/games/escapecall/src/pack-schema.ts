// 舞台パックJSONの構造検証。型の正本は shared/games/escapecall の pack.ts にある。
//
// ここは「JSONとして読めたものが型に合うか」だけを見る。値の妥当性（件数・穴の過不足）は
// validate-content.ts が見る。段を分けるのは、構造が壊れている状態で値の検査を走らせても
// 反例が読めないためである。
import {
  RULE_IDS,
  type EscapeCallPack,
  type KeyExpression,
  type LockLabel,
  type RuleId,
  type RulePhrase,
  type SceneText,
} from "@beb/shared-escapecall";

// 重複の記録（ADR-0020）: SchemaIssue / isObject / readString / parseArray は
// 収録5本と同じ形の6コピー目である。共通コアへ移す対象だが、6本すべてを触る変更になるため
// 本ゲームの追加では移さず記録に留める（docs/既知の課題.md）。
export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: EscapeCallPack } | { ok: false; issues: SchemaIssue[] };

/** 定義に無い欄。錠の答え・並び・対応表を書く欄を設けない（ADR-0027） */
const ROOT_KEYS = ["id", "title", "scene", "lockLabels", "keyExpressions", "rulePhrases"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string, path: string, issues: SchemaIssue[]): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ path: `${path}.${key}`, message: "空でない文字列である必要がある" });
    return "";
  }
  return value;
}

function parseArray<T>(
  value: unknown,
  path: string,
  issues: SchemaIssue[],
  parseEntry: (entry: unknown, entryPath: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "配列である必要がある" });
    return [];
  }
  return value.map((entry, index) => parseEntry(entry, `${path}[${index}]`));
}

function parsePair(value: unknown, path: string, issues: SchemaIssue[]): KeyExpression & LockLabel {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { en: "", ja: "" };
  }
  return { en: readString(value, "en", path, issues), ja: readString(value, "ja", path, issues) };
}

function parseScene(value: unknown, issues: SchemaIssue[]): SceneText {
  const path = "(root).scene";
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { titleEn: "", titleJa: "", introEn: "", introJa: "" };
  }
  return {
    titleEn: readString(value, "titleEn", path, issues),
    titleJa: readString(value, "titleJa", path, issues),
    introEn: readString(value, "introEn", path, issues),
    introJa: readString(value, "introJa", path, issues),
  };
}

/**
 * 規則の言い回し。未知の規則IDと欠けた規則IDは検証4の対象であり、ここでは型だけを見る。
 * 型が合わない規則は空の言い回しにして、検証4〜8の反例として読めるようにする。
 */
function parseRulePhrases(value: unknown, issues: SchemaIssue[]): Record<RuleId, RulePhrase> {
  const path = "(root).rulePhrases";
  const result = {} as Record<RuleId, RulePhrase>;
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return result;
  }
  for (const [ruleId, phrase] of Object.entries(value)) {
    const entryPath = `${path}.${ruleId}`;
    if (!isObject(phrase)) {
      issues.push({ path: entryPath, message: "オブジェクトである必要がある" });
      continue;
    }
    (result as Record<string, RulePhrase>)[ruleId] = {
      easy: typeof phrase.easy === "string" ? phrase.easy : "",
      standard: typeof phrase.standard === "string" ? phrase.standard : "",
      ja: typeof phrase.ja === "string" ? phrase.ja : "",
    };
  }
  return result;
}

export function parsePack(content: unknown): ParseResult {
  const issues: SchemaIssue[] = [];
  if (!isObject(content)) {
    return { ok: false, issues: [{ path: "(root)", message: "オブジェクトである必要がある" }] };
  }

  for (const key of Object.keys(content)) {
    if (!ROOT_KEYS.includes(key)) {
      issues.push({ path: `(root).${key}`, message: "定義に無い欄である。錠の答えや並びはコンテンツに持たない（ADR-0027）" });
    }
  }

  const pack: EscapeCallPack = {
    id: readString(content, "id", "(root)", issues),
    title: readString(content, "title", "(root)", issues),
    scene: parseScene(content.scene, issues),
    lockLabels: parseArray(content.lockLabels, "(root).lockLabels", issues, (entry, entryPath) =>
      parsePair(entry, entryPath, issues),
    ),
    keyExpressions: parseArray(content.keyExpressions, "(root).keyExpressions", issues, (entry, entryPath) =>
      parsePair(entry, entryPath, issues),
    ),
    rulePhrases: parseRulePhrases(content.rulePhrases, issues),
  };

  return issues.length === 0 ? { ok: true, value: pack } : { ok: false, issues };
}

/** 検証4が「欠けた規則ID」を数えるために公開する */
export const KNOWN_RULE_IDS: readonly string[] = RULE_IDS;
