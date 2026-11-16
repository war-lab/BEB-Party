// お題セットJSONの構造検証。型の正本は shared/games/twoheaded の set.ts にある。
//
// ここは「JSONとして読めたものが型に合うか」と、定義に無い欄が無いか、カードidがセット内で一意かだけを見る（16の検証1）。
// 値の妥当性（文字種・重複・枚数・別名の形・書き出しの形）は validate-content.ts が見る。
// 段を分けるのは、構造が壊れている状態で値の検査を走らせても反例が読めないためである。
//
// SchemaIssue / isObject / readString / parseArray は収録の各ゲームとほぼ同じ形のコピーである（既知の課題.mdの「お題パックの検証ヘルパ」）。
import type { Card, KeyExpression, TwoHeadedSet } from "@beb/shared-twoheaded";

export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: TwoHeadedSet } | { ok: false; issues: SchemaIssue[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 定義に無い欄を落とす（16の検証1）。入れ子の中も見る */
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

function parseCard(value: unknown, path: string, issues: SchemaIssue[]): Card {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { id: "", answer: "", ja: "" };
  }
  checkKeys(value, ["id", "answer", "ja", "aliases"], path, issues);
  const card: Card = {
    id: readString(value, "id", path, issues),
    answer: readString(value, "answer", path, issues),
    ja: readString(value, "ja", path, issues),
  };
  // aliases は省略可。別名を持たないカードにキーを書かせない
  if (value.aliases !== undefined) {
    card.aliases = parseArray(value.aliases, `${path}.aliases`, issues, (entry, entryPath) => {
      if (typeof entry !== "string" || entry.length === 0) {
        issues.push({ path: entryPath, message: "空でない文字列である必要がある" });
        return "";
      }
      return entry;
    });
  }
  return card;
}

function parseKeyExpression(value: unknown, path: string, issues: SchemaIssue[]): KeyExpression {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { en: "", ja: "" };
  }
  checkKeys(value, ["en", "ja"], path, issues);
  return { en: readString(value, "en", path, issues), ja: readString(value, "ja", path, issues) };
}

export function parseSet(content: unknown): ParseResult {
  const issues: SchemaIssue[] = [];
  if (!isObject(content)) {
    return { ok: false, issues: [{ path: "(root)", message: "オブジェクトである必要がある" }] };
  }
  checkKeys(content, ["id", "title", "cards", "starters", "keyExpressions"], "(root)", issues);

  const set: TwoHeadedSet = {
    id: readString(content, "id", "(root)", issues),
    title: readString(content, "title", "(root)", issues),
    cards: parseArray(content.cards, "(root).cards", issues, (entry, entryPath) => parseCard(entry, entryPath, issues)),
    starters: parseArray(content.starters, "(root).starters", issues, (entry, entryPath) =>
      parseKeyExpression(entry, entryPath, issues),
    ),
    keyExpressions: parseArray(content.keyExpressions, "(root).keyExpressions", issues, (entry, entryPath) =>
      parseKeyExpression(entry, entryPath, issues),
    ),
  };

  // カードidの重複。gameSecret がidで山札を指すため、重複していると別のお題を引ける（16の検証1）
  const seen = new Set<string>();
  for (const [index, card] of set.cards.entries()) {
    if (card.id.length === 0) {
      continue;
    }
    if (seen.has(card.id)) {
      issues.push({ path: `(root).cards[${index}].id`, message: `カードidが重複している: ${card.id}` });
    }
    seen.add(card.id);
  }

  return issues.length === 0 ? { ok: true, value: set } : { ok: false, issues };
}
