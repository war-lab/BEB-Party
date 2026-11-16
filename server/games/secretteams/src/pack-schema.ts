// テーマパックJSONの構造検証。型の正本は shared/games/secretteams の pack.ts にある。
//
// ここは「JSONとして読めたものが型に合うか」と、定義に無い欄が無いかだけを見る（17の検証1）。
// 値の妥当性（件数・形・重複）は validate-content.ts が見る。
// 段を分けるのは、構造が壊れている状態で値の検査を走らせても反例が読めないためである。
//
// SchemaIssue / isObject / readString / parseArray は収録8本の pack-schema.ts とほぼ同じ形のコピーである
// （docs/既知の課題.md「お題パックの検証ヘルパが重複している」）。
import type { FamilySpec, KeyExpression, SecretTeamsPack, ThemeSpec, WordCard } from "@beb/shared-secretteams";

export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: SecretTeamsPack } | { ok: false; issues: SchemaIssue[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 定義に無い欄を落とす（17の検証1）。入れ子の中も見る */
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

/** en と ja だけを持つ要素（単語と言い回し） */
function parseText(value: unknown, path: string, issues: SchemaIssue[]): WordCard | KeyExpression {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { en: "", ja: "" };
  }
  checkKeys(value, ["en", "ja"], path, issues);
  return { en: readString(value, "en", path, issues), ja: readString(value, "ja", path, issues) };
}

function parseTheme(value: unknown, path: string, issues: SchemaIssue[]): ThemeSpec {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", en: "", ja: "", words: [] };
  }
  checkKeys(value, ["id", "en", "ja", "words"], path, issues);
  return {
    id: readString(value, "id", path, issues),
    en: readString(value, "en", path, issues),
    ja: readString(value, "ja", path, issues),
    words: parseArray(value.words, `${path}.words`, issues, (entry, entryPath) => parseText(entry, entryPath, issues)),
  };
}

function parseFamily(value: unknown, path: string, issues: SchemaIssue[]): FamilySpec {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", themes: [] };
  }
  checkKeys(value, ["id", "themes"], path, issues);
  return {
    id: readString(value, "id", path, issues),
    themes: parseArray(value.themes, `${path}.themes`, issues, (entry, entryPath) =>
      parseTheme(entry, entryPath, issues),
    ),
  };
}

export function parsePack(content: unknown): ParseResult {
  const issues: SchemaIssue[] = [];
  if (!isObject(content)) {
    return { ok: false, issues: [{ path: "(root)", message: "オブジェクトである必要がある" }] };
  }
  checkKeys(content, ["id", "title", "keyExpressions", "families"], "(root)", issues);

  const pack: SecretTeamsPack = {
    id: readString(content, "id", "(root)", issues),
    title: readString(content, "title", "(root)", issues),
    keyExpressions: parseArray(content.keyExpressions, "(root).keyExpressions", issues, (entry, entryPath) =>
      parseText(entry, entryPath, issues),
    ),
    families: parseArray(content.families, "(root).families", issues, (entry, entryPath) =>
      parseFamily(entry, entryPath, issues),
    ),
  };

  return issues.length === 0 ? { ok: true, value: pack } : { ok: false, issues };
}
