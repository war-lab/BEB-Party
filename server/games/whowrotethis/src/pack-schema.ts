// 質問パックJSONの構造検証。型の正本は shared/games/whowrotethis の pack.ts にある。
//
// ここは「JSONとして読めたものが型に合うか」だけを見る。値の妥当性（件数・一意性・語数）は
// validate-content.ts が見る。段を分けるのは、構造が壊れている状態で値の検査を走らせても
// 反例が読めないためである。
import type { KeyExpression, Question, WhoWroteThisPack } from "@beb/shared-whowrotethis";

export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: WhoWroteThisPack } | { ok: false; issues: SchemaIssue[] };

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

function parseKeyExpression(value: unknown, path: string, issues: SchemaIssue[]): KeyExpression {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { en: "", ja: "" };
  }
  return {
    en: readString(value, "en", path, issues),
    ja: readString(value, "ja", path, issues),
  };
}

function parseQuestion(value: unknown, path: string, issues: SchemaIssue[]): Question {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", en: "", ja: "", hintEn: [] };
  }
  return {
    id: readString(value, "id", path, issues),
    en: readString(value, "en", path, issues),
    ja: readString(value, "ja", path, issues),
    hintEn: parseArray(value.hintEn, `${path}.hintEn`, issues, (entry, entryPath) => {
      if (typeof entry !== "string" || entry.length === 0) {
        issues.push({ path: entryPath, message: "空でない文字列である必要がある" });
        return "";
      }
      return entry;
    }),
  };
}

export function parsePack(content: unknown): ParseResult {
  const issues: SchemaIssue[] = [];
  if (!isObject(content)) {
    return { ok: false, issues: [{ path: "(root)", message: "オブジェクトである必要がある" }] };
  }

  const pack: WhoWroteThisPack = {
    id: readString(content, "id", "(root)", issues),
    title: readString(content, "title", "(root)", issues),
    keyExpressions: parseArray(content.keyExpressions, "(root).keyExpressions", issues, (entry, entryPath) =>
      parseKeyExpression(entry, entryPath, issues),
    ),
    questions: parseArray(content.questions, "(root).questions", issues, (entry, entryPath) =>
      parseQuestion(entry, entryPath, issues),
    ),
  };

  return issues.length === 0 ? { ok: true, value: pack } : { ok: false, issues };
}
