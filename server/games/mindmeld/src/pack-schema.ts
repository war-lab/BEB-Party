// お題パックJSONの構造検証。型の正本は shared/games/mindmeld の pack.ts にある。
//
// ここは「JSONとして読めたものが型に合うか」と、定義に無い欄が無いかだけを見る（15の検証1）。
// 値の妥当性（件数・形・重複）は validate-content.ts が見る。
// 段を分けるのは、構造が壊れている状態で値の検査を走らせても反例が読めないためである。
import type { KeyExpression, MindMeldPack, PromptSpec } from "@beb/shared-mindmeld";

export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: MindMeldPack } | { ok: false; issues: SchemaIssue[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 定義に無い欄を落とす（15の検証1）。入れ子の中も見る */
function checkKeys(source: Record<string, unknown>, allowed: readonly string[], path: string, issues: SchemaIssue[]) {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      issues.push({ path: `${path}.${key}`, message: "定義に無い欄である" });
    }
  }
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

function parsePrompt(value: unknown, path: string, issues: SchemaIssue[]): PromptSpec {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", en: "", ja: "" };
  }
  checkKeys(value, ["id", "en", "ja"], path, issues);
  return {
    id: readString(value, "id", path, issues),
    en: readString(value, "en", path, issues),
    ja: readString(value, "ja", path, issues),
  };
}

function parseKeyExpression(value: unknown, path: string, issues: SchemaIssue[]): KeyExpression {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { en: "", ja: "" };
  }
  checkKeys(value, ["en", "ja"], path, issues);
  return { en: readString(value, "en", path, issues), ja: readString(value, "ja", path, issues) };
}

export function parsePack(content: unknown): ParseResult {
  const issues: SchemaIssue[] = [];
  if (!isObject(content)) {
    return { ok: false, issues: [{ path: "(root)", message: "オブジェクトである必要がある" }] };
  }
  checkKeys(content, ["id", "title", "prompts", "keyExpressions"], "(root)", issues);

  const pack: MindMeldPack = {
    id: readString(content, "id", "(root)", issues),
    title: readString(content, "title", "(root)", issues),
    prompts: parseArray(content.prompts, "(root).prompts", issues, (entry, entryPath) =>
      parsePrompt(entry, entryPath, issues),
    ),
    keyExpressions: parseArray(content.keyExpressions, "(root).keyExpressions", issues, (entry, entryPath) =>
      parseKeyExpression(entry, entryPath, issues),
    ),
  };

  return issues.length === 0 ? { ok: true, value: pack } : { ok: false, issues };
}
