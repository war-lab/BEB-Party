// お題データの構造検証。型が合っているかだけを見る。
// 内容の妥当性（正解の非露出・枚数・語数）は validate-content.ts が見る。
//
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import type { Card, ConstraintCard, KeyExpression, TabooSet } from "@beb/shared-dontsayit";

export interface SchemaIssue {
  /** 問題のあった位置のJSONパス */
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: TabooSet } | { ok: false; issues: SchemaIssue[] };

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

function parseCard(value: unknown, path: string, issues: SchemaIssue[]): Card {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", answer: "", taboo: [] };
  }
  const id = readString(value, "id", path, issues);
  const answer = readString(value, "answer", path, issues);

  const rawTaboo = value["taboo"];
  if (!Array.isArray(rawTaboo)) {
    issues.push({ path: `${path}.taboo`, message: "配列である必要がある" });
    return { id, answer, taboo: [] };
  }
  const taboo = rawTaboo.map((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      issues.push({ path: `${path}.taboo[${index}]`, message: "空でない文字列である必要がある" });
      return "";
    }
    return entry;
  });
  return { id, answer, taboo };
}

function parseConstraint(value: unknown, path: string, issues: SchemaIssue[]): ConstraintCard {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", ja: "", en: "" };
  }
  return {
    id: readString(value, "id", path, issues),
    ja: readString(value, "ja", path, issues),
    en: readString(value, "en", path, issues),
  };
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

function parseArray<T>(
  source: Record<string, unknown>,
  key: string,
  parseItem: (value: unknown, path: string, issues: SchemaIssue[]) => T,
  issues: SchemaIssue[],
): T[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    issues.push({ path: `$.${key}`, message: "配列である必要がある" });
    return [];
  }
  return value.map((entry, index) => parseItem(entry, `$.${key}[${index}]`, issues));
}

/** お題セットのJSONを構造検証する。1件でも問題があれば ok: false を返す */
export function parseSet(content: unknown): ParseResult {
  const issues: SchemaIssue[] = [];
  if (!isObject(content)) {
    return { ok: false, issues: [{ path: "$", message: "オブジェクトである必要がある" }] };
  }

  const value: TabooSet = {
    id: readString(content, "id", "$", issues),
    title: readString(content, "title", "$", issues),
    cards: parseArray(content, "cards", parseCard, issues),
    constraints: parseArray(content, "constraints", parseConstraint, issues),
    keyExpressions: parseArray(content, "keyExpressions", parseKeyExpression, issues),
  };

  // カードidの重複は参照の壊れと同じ扱いにする。gameSecretがidで山札を指すため、
  // 重複していると別のカードを引ける（09のゲーム秘密状態）
  const seen = new Set<string>();
  for (const [index, card] of value.cards.entries()) {
    if (card.id.length === 0) {
      continue;
    }
    if (seen.has(card.id)) {
      issues.push({ path: `$.cards[${index}].id`, message: `カードidが重複している: ${card.id}` });
    }
    seen.add(card.id);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value };
}
