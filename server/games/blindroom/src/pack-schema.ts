// お題パックJSONの構造検証。型の正本は shared/games/blindroom の pack.ts にある。
//
// ここは「JSONとして読めたものが型に合うか」だけを見る。値の妥当性（件数・一意性・文字種）は
// validate-content.ts が見る。段を分けるのは、構造が壊れている状態で値の検査を走らせても
// 反例が読めないためである。
import type { BlindRoomPack, ItemDefinition, ItemSet, KeyExpression, Tier } from "@beb/shared-blindroom";

export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: BlindRoomPack } | { ok: false; issues: SchemaIssue[] };

const TIERS: Tier[] = ["easy", "standard"];

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

function readTier(source: Record<string, unknown>, path: string, issues: SchemaIssue[]): Tier {
  const value = source.tier;
  if (typeof value !== "string" || !TIERS.includes(value as Tier)) {
    issues.push({ path: `${path}.tier`, message: `${TIERS.join(" か ")} である必要がある` });
    return "easy";
  }
  return value as Tier;
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

function parseStringArray(value: unknown, path: string, issues: SchemaIssue[]): string[] {
  return parseArray(value, path, issues, (entry, entryPath) => {
    if (typeof entry !== "string" || entry.length === 0) {
      issues.push({ path: entryPath, message: "空でない文字列である必要がある" });
      return "";
    }
    return entry;
  });
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

function parseItem(value: unknown, path: string, issues: SchemaIssue[]): ItemDefinition {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", en: "", ja: "", icon: "" };
  }
  return {
    id: readString(value, "id", path, issues),
    en: readString(value, "en", path, issues),
    ja: readString(value, "ja", path, issues),
    icon: readString(value, "icon", path, issues),
  };
}

function parseItemSet(value: unknown, path: string, issues: SchemaIssue[]): ItemSet {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", tier: "easy", describerHints: [], items: [] };
  }
  return {
    id: readString(value, "id", path, issues),
    tier: readTier(value, path, issues),
    describerHints: parseStringArray(value.describerHints, `${path}.describerHints`, issues),
    items: parseArray(value.items, `${path}.items`, issues, (entry, entryPath) => parseItem(entry, entryPath, issues)),
  };
}

export function parsePack(content: unknown): ParseResult {
  const issues: SchemaIssue[] = [];
  if (!isObject(content)) {
    return { ok: false, issues: [{ path: "(root)", message: "オブジェクトである必要がある" }] };
  }

  // 盤面はコンテンツに持たない。書かれていたらスキーマ違反として落とす（ADR-0024）
  if ("samples" in content || "boards" in content) {
    issues.push({ path: "(root)", message: "見本の盤面はコンテンツに持たない（ADR-0024）" });
  }

  const pack: BlindRoomPack = {
    id: readString(content, "id", "(root)", issues),
    title: readString(content, "title", "(root)", issues),
    keyExpressions: parseArray(content.keyExpressions, "(root).keyExpressions", issues, (entry, entryPath) =>
      parseKeyExpression(entry, entryPath, issues),
    ),
    itemSets: parseArray(content.itemSets, "(root).itemSets", issues, (entry, entryPath) =>
      parseItemSet(entry, entryPath, issues),
    ),
  };

  return issues.length === 0 ? { ok: true, value: pack } : { ok: false, issues };
}
