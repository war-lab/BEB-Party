// 規則パックJSONの構造検証。型の正本は shared/games/secretrule の pack.ts にある。
//
// ここは「JSONとして読めたものが型に合うか」と、定義に無い欄が無いかだけを見る（14の検証1）。
// 値の妥当性（件数・範囲・文例集での割合）は validate-content.ts が見る。
// 段を分けるのは、構造が壊れている状態で値の検査を走らせても反例が読めないためである。
import { isRuleId, type CandidateSpec, type RulePhrase, type SecretRulePack } from "@beb/shared-secretrule";

export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: SecretRulePack } | { ok: false; issues: SchemaIssue[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 定義に無い欄を落とす（14の検証1）。入れ子の中も見る */
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

function parseEnJa(value: unknown, path: string, issues: SchemaIssue[]): { en: string; ja: string } {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return { en: "", ja: "" };
  }
  checkKeys(value, ["en", "ja"], path, issues);
  return { en: readString(value, "en", path, issues), ja: readString(value, "ja", path, issues) };
}

/** パラメータの形だけを見る。範囲は検証4が見る */
function parseParams(ruleId: CandidateSpec["ruleId"], value: unknown, path: string, issues: SchemaIssue[]): unknown {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return {};
  }
  switch (ruleId) {
    case "min_words":
    case "max_words":
    case "long_word":
    case "short_words":
      checkKeys(value, ["n"], path, issues);
      if (typeof value.n !== "number") {
        issues.push({ path: `${path}.n`, message: "数値である必要がある" });
      }
      return { n: value.n };
    case "has_word":
    case "no_word":
      checkKeys(value, ["words"], path, issues);
      return {
        words: parseArray(value.words, `${path}.words`, issues, (entry, entryPath) => {
          if (typeof entry !== "string" || entry.length === 0) {
            issues.push({ path: entryPath, message: "空でない文字列である必要がある" });
            return "";
          }
          return entry;
        }),
      };
    case "has_letter":
    case "no_letter":
    case "starts_with":
      checkKeys(value, ["letter"], path, issues);
      return { letter: readString(value, "letter", path, issues) };
    case "ends_with":
      checkKeys(value, ["mark"], path, issues);
      return { mark: readString(value, "mark", path, issues) };
  }
}

function parseCandidate(value: unknown, path: string, issues: SchemaIssue[]): CandidateSpec | null {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return null;
  }
  checkKeys(value, ["id", "ruleId", "params"], path, issues);
  const id = readString(value, "id", path, issues);
  if (!isRuleId(value.ruleId)) {
    issues.push({ path: `${path}.ruleId`, message: "コードに定義された規則IDである必要がある" });
    return null;
  }
  const params = parseParams(value.ruleId, value.params, `${path}.params`, issues);
  // 形の検査を通った値だけを型付けする。範囲の検査は検証4が行う
  return { id, ruleId: value.ruleId, params } as CandidateSpec;
}

function parseRulePhrases(value: unknown, path: string, issues: SchemaIssue[]): Partial<Record<string, RulePhrase>> {
  if (!isObject(value)) {
    issues.push({ path, message: "オブジェクトである必要がある" });
    return {};
  }
  const phrases: Partial<Record<string, RulePhrase>> = {};
  for (const [key, entry] of Object.entries(value)) {
    // 未知の規則IDは検証5が落とす。ここでは形だけを見る
    phrases[key] = parseEnJa(entry, `${path}.${key}`, issues);
  }
  return phrases;
}

export function parsePack(content: unknown): ParseResult {
  const issues: SchemaIssue[] = [];
  if (!isObject(content)) {
    return { ok: false, issues: [{ path: "(root)", message: "オブジェクトである必要がある" }] };
  }
  checkKeys(content, ["id", "title", "keyExpressions", "starters", "candidates", "rulePhrases"], "(root)", issues);

  const candidates = parseArray(content.candidates, "(root).candidates", issues, (entry, entryPath) =>
    parseCandidate(entry, entryPath, issues),
  ).filter((entry): entry is CandidateSpec => entry !== null);

  const pack: SecretRulePack = {
    id: readString(content, "id", "(root)", issues),
    title: readString(content, "title", "(root)", issues),
    keyExpressions: parseArray(content.keyExpressions, "(root).keyExpressions", issues, (entry, entryPath) =>
      parseEnJa(entry, entryPath, issues),
    ),
    starters: parseArray(content.starters, "(root).starters", issues, (entry, entryPath) =>
      parseEnJa(entry, entryPath, issues),
    ),
    candidates,
    rulePhrases: parseRulePhrases(content.rulePhrases, "(root).rulePhrases", issues),
  };

  return issues.length === 0 ? { ok: true, value: pack } : { ok: false, issues };
}
