// お題パックJSONの構造検証。型の正本は shared/games/ranking の pack.ts にある。
//
// ここは「JSONとして読めたものが型に合うか」だけを見る。値の妥当性（達成可能性・難度の一致等）は
// validate-content.ts が見る。段を分けるのは、構造が壊れている状態で値の検査を走らせても
// 反例が読めないためである。
import { ITEMS_PER_SET, type Goal, type GoalCard, type GoalDifficulty, type KeyExpression, type RankingItem, type RankingPack, type RankingSet } from "@beb/shared-ranking";

export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: RankingPack } | { ok: false; issues: SchemaIssue[] };

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

function readInteger(source: Record<string, unknown>, key: string, path: string, issues: SchemaIssue[]): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    issues.push({ path: `${path}.${key}`, message: "整数である必要がある" });
    return 0;
  }
  return value;
}

function parseArray<T>(
  value: unknown,
  path: string,
  issues: SchemaIssue[],
  parseItem: (item: unknown, itemPath: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "配列である必要がある" });
    return [];
  }
  return value.map((item, index) => parseItem(item, `${path}[${index}]`));
}

function parseItem(value: unknown, path: string, issues: SchemaIssue[]): RankingItem {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", en: "", ja: "" };
  }
  return {
    id: readString(value, "id", path, issues),
    en: readString(value, "en", path, issues),
    ja: readString(value, "ja", path, issues),
  };
}

/** 述語。typeで分岐し、type別に必要な欄だけを読む */
function parseGoal(value: unknown, path: string, issues: SchemaIssue[]): Goal {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { type: "top", item: "", within: 1 };
  }
  const type = value["type"];
  switch (type) {
    case "above":
      return { type: "above", item: readString(value, "item", path, issues), than: readString(value, "than", path, issues) };
    case "top":
      return { type: "top", item: readString(value, "item", path, issues), within: readInteger(value, "within", path, issues) };
    case "bottom":
      return { type: "bottom", item: readString(value, "item", path, issues), within: readInteger(value, "within", path, issues) };
    case "exact":
      return { type: "exact", item: readString(value, "item", path, issues), rank: readInteger(value, "rank", path, issues) };
    default:
      issues.push({ path: `${path}.type`, message: "above / top / bottom / exact のいずれかである必要がある" });
      return { type: "top", item: "", within: 1 };
  }
}

function parseDifficulty(value: unknown, path: string, issues: SchemaIssue[]): GoalDifficulty {
  if (value === 1 || value === 2 || value === 3) {
    return value;
  }
  issues.push({ path: `${path}.difficulty`, message: "1 / 2 / 3 のいずれかである必要がある" });
  return 1;
}

function parseGoalCard(value: unknown, path: string, issues: SchemaIssue[]): GoalCard {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", difficulty: 1, ja: "", hintEn: [], goal: { type: "top", item: "", within: 1 } };
  }
  return {
    id: readString(value, "id", path, issues),
    difficulty: parseDifficulty(value["difficulty"], path, issues),
    ja: readString(value, "ja", path, issues),
    hintEn: parseArray(value["hintEn"], `${path}.hintEn`, issues, (item, itemPath) => {
      if (typeof item !== "string" || item.length === 0) {
        issues.push({ path: itemPath, message: "空でない文字列である必要がある" });
        return "";
      }
      return item;
    }),
    goal: parseGoal(value["goal"], `${path}.goal`, issues),
  };
}

function parseKeyExpression(value: unknown, path: string, issues: SchemaIssue[]): KeyExpression {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { en: "", ja: "" };
  }
  return { en: readString(value, "en", path, issues), ja: readString(value, "ja", path, issues) };
}

function parseQuestion(value: unknown, path: string, issues: SchemaIssue[]): { en: string; ja: string } {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { en: "", ja: "" };
  }
  return { en: readString(value, "en", path, issues), ja: readString(value, "ja", path, issues) };
}

function parseSet(value: unknown, path: string, issues: SchemaIssue[]): RankingSet {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", question: { en: "", ja: "" }, items: [], goals: [], keyExpressions: [] };
  }
  return {
    id: readString(value, "id", path, issues),
    question: parseQuestion(value["question"], `${path}.question`, issues),
    items: parseArray(value["items"], `${path}.items`, issues, (item, itemPath) => parseItem(item, itemPath, issues)),
    goals: parseArray(value["goals"], `${path}.goals`, issues, (item, itemPath) => parseGoalCard(item, itemPath, issues)),
    keyExpressions: parseArray(value["keyExpressions"], `${path}.keyExpressions`, issues, (item, itemPath) =>
      parseKeyExpression(item, itemPath, issues),
    ),
  };
}

export function parsePack(content: unknown): ParseResult {
  const issues: SchemaIssue[] = [];
  if (!isObject(content)) {
    return { ok: false, issues: [{ path: "$", message: "オブジェクトである必要がある" }] };
  }

  const value: RankingPack = {
    id: readString(content, "id", "$", issues),
    title: readString(content, "title", "$", issues),
    sets: parseArray(content["sets"], "$.sets", issues, (item, itemPath) => parseSet(item, itemPath, issues)),
  };

  // 項目数が5でないと全順列の総当たりが意味を失うため、構造の段で落とす
  for (const [index, set] of value.sets.entries()) {
    if (set.items.length !== ITEMS_PER_SET) {
      issues.push({ path: `$.sets[${index}].items`, message: `${ITEMS_PER_SET}件である必要がある` });
    }
  }

  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}
