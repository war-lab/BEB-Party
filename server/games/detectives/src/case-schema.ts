// 事件データの構造検証。型（正本）は @beb/shared-detectives の case.ts にあり、
// ここでは外部入力（JSON）を unknown から受け取って構造・参照整合性を確かめる。
//
// 推論を伴う7項目（validate-content.ts）はこの検証を通ったデータにしか適用しない。
// 構造が壊れたデータに推論を掛けても、作者にとって役立つ反例が出ないためである。
//
// 表示テキスト（text・hintJa・briefing・reveal）の欠落はここでは扱わない。
// 推論の骨格とは独立した品質であり、検証6（表示完全性）がJSONパス付きで報告する。
import type { Case, Character, Contradiction, Fact, Variant } from "@beb/shared-detectives";

/** 構造上の不備。pathはJSONパス（04・06の反例出力） */
export interface SchemaIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; value: Case } | { ok: false; issues: SchemaIssue[] };

const DISCLOSURES = ["free", "on_question_only"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

class IssueCollector {
  readonly issues: SchemaIssue[] = [];

  add(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  get hasIssue(): boolean {
    return this.issues.length > 0;
  }
}

function checkCharacters(raw: unknown, issues: IssueCollector): Character[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.add("characters", "characters は1件以上の配列である必要がある");
    return [];
  }

  const characters: Character[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const path = `characters[${index}]`;
    if (!isRecord(entry)) {
      issues.add(path, "オブジェクトである必要がある");
      return;
    }
    if (!isNonEmptyString(entry.id)) {
      issues.add(`${path}.id`, "idが空である");
      return;
    }
    if (seen.has(entry.id)) {
      issues.add(`${path}.id`, `キャラクターidが重複している: ${entry.id}`);
      return;
    }
    seen.add(entry.id);
    if (!isNonEmptyString(entry.name)) {
      issues.add(`${path}.name`, "nameが空である");
    }
    if (
      typeof entry.recommendedLevel !== "number" ||
      !Number.isInteger(entry.recommendedLevel) ||
      entry.recommendedLevel < 1 ||
      entry.recommendedLevel > 5
    ) {
      issues.add(`${path}.recommendedLevel`, "recommendedLevelは1〜5である必要がある");
    }
    if (entry.merge5p !== null && !isNonEmptyString(entry.merge5p)) {
      issues.add(`${path}.merge5p`, "merge5pはキャラクターidまたはnullである必要がある");
    }
    characters.push(entry as unknown as Character);
  });

  // 統合先の存在と、統合の連鎖（Xの統合先Y自身が統合される）を禁じる。
  // 連鎖を許すと導出結果が適用順に依存するため、事件データ側で解消させる（06の導出手順）
  for (const character of characters) {
    if (character.merge5p === null) {
      continue;
    }
    const target = characters.find((other) => other.id === character.merge5p);
    if (target === undefined) {
      issues.add(`characters[${character.id}].merge5p`, `統合先のキャラクターが存在しない: ${character.merge5p}`);
      continue;
    }
    if (target.id === character.id) {
      issues.add(`characters[${character.id}].merge5p`, "自分自身を統合先にできない");
    }
    if (target.merge5p !== null) {
      issues.add(`characters[${character.id}].merge5p`, `統合先 ${target.id} 自身が統合される（統合の連鎖は許さない）`);
    }
  }

  return characters;
}

function checkFacts(raw: unknown, characters: Character[], issues: IssueCollector): Fact[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.add("facts", "facts は1件以上の配列である必要がある");
    return [];
  }

  const facts: Fact[] = [];
  const seenIds = new Set<string>();
  const seenValues = new Set<string>();
  raw.forEach((entry, index) => {
    const path = `facts[${index}]`;
    if (!isRecord(entry)) {
      issues.add(path, "オブジェクトである必要がある");
      return;
    }
    if (!isNonEmptyString(entry.id)) {
      issues.add(`${path}.id`, "idが空である");
      return;
    }
    if (seenIds.has(entry.id)) {
      issues.add(`${path}.id`, `fact idが重複している: ${entry.id}`);
      return;
    }
    seenIds.add(entry.id);

    if (!characters.some((character) => character.id === entry.owner)) {
      issues.add(`${path}.owner`, `ownerが存在しないキャラクターを指している: ${String(entry.owner)}`);
    }
    if (!isNonEmptyString(entry.value)) {
      issues.add(`${path}.value`, "valueが空である");
    } else if (seenValues.has(entry.value)) {
      // 値が推論エンジンのシンボルになるため、重複すると別々の事実が同一視される
      issues.add(`${path}.value`, `valueが他の事実と重複している: ${entry.value}`);
    } else {
      seenValues.add(entry.value);
    }
    if (typeof entry.disclosure !== "string" || !DISCLOSURES.includes(entry.disclosure)) {
      issues.add(`${path}.disclosure`, "disclosureは free または on_question_only である必要がある");
    }
    facts.push(entry as unknown as Fact);
  });

  // 証言を1枚も持たないキャラクターは配役できない。
  // 検証2はキャラクター単位で「除くと解けなくなるか」を見るため、事実を持たない
  // キャラクターは常に合格になる。ここで弾かないと穴が検証をすり抜ける
  for (const character of characters) {
    if (!facts.some((fact) => fact.owner === character.id)) {
      issues.add(`characters[${character.id}]`, "証言を1枚も持たないキャラクターがいる");
    }
  }

  return facts;
}

function checkContradiction(
  raw: unknown,
  path: string,
  context: { facts: Fact[]; lieFactId: string; yieldsInVariant: Set<string>; factValues: Set<string> },
  issues: IssueCollector,
): void {
  if (!isRecord(raw)) {
    issues.add(path, "オブジェクトである必要がある");
    return;
  }

  if (!isNonEmptyString(raw.yields)) {
    issues.add(`${path}.yields`, "yieldsが空である");
  } else if (context.factValues.has(raw.yields)) {
    issues.add(`${path}.yields`, `yieldsが事実のvalueと衝突している: ${raw.yields}`);
  }

  // requiresに嘘factを含める規約（ADR-0008）は検証4が報告する。
  // 規約の目的が「正直な証言だけで矛盾が発火しないこと」の保証そのものであり、構造の不備ではないためである
  const checkRequires = (requires: unknown, requiresPath: string): void => {
    if (!Array.isArray(requires) || requires.length === 0) {
      issues.add(requiresPath, "requiresは1件以上の配列である必要がある");
      return;
    }
    requires.forEach((entry, index) => {
      if (typeof entry !== "string") {
        issues.add(`${requiresPath}[${index}]`, "requiresの要素は文字列である必要がある");
        return;
      }
      const isFact = context.facts.some((fact) => fact.id === entry);
      const isYield = context.yieldsInVariant.has(entry);
      if (!isFact && !isYield) {
        issues.add(`${requiresPath}[${index}]`, `未知の参照: ${entry}（fact idか同一バリアントのyieldsである必要がある）`);
      }
    });
  };

  checkRequires(raw.requires, `${path}.requires`);
  if (raw.requires5p !== null && raw.requires5p !== undefined) {
    checkRequires(raw.requires5p, `${path}.requires5p`);
  } else if (raw.requires5p === undefined) {
    issues.add(`${path}.requires5p`, "requires5pはstring[]またはnullを明示する");
  }
}

function checkVariants(raw: unknown, characters: Character[], facts: Fact[], issues: IssueCollector): Variant[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.add("variants", "variants は1件以上の配列である必要がある");
    return [];
  }

  const factValues = new Set(facts.map((fact) => fact.value));
  const variants: Variant[] = [];
  const seenCulprits = new Set<string>();

  raw.forEach((entry, index) => {
    const path = `variants[${index}]`;
    if (!isRecord(entry)) {
      issues.add(path, "オブジェクトである必要がある");
      return;
    }
    if (!isNonEmptyString(entry.culprit) || !characters.some((character) => character.id === entry.culprit)) {
      issues.add(`${path}.culprit`, `culpritが存在しないキャラクターを指している: ${String(entry.culprit)}`);
      return;
    }
    if (seenCulprits.has(entry.culprit)) {
      issues.add(`${path}.culprit`, `同じ犯人のバリアントが重複している: ${entry.culprit}`);
      return;
    }
    seenCulprits.add(entry.culprit);

    const lie: unknown = entry.lie;
    if (!isRecord(lie)) {
      issues.add(`${path}.lie`, "lieはオブジェクトである必要がある");
      return;
    }
    const replaced = facts.find((fact) => fact.id === lie.replaces);
    if (replaced === undefined) {
      issues.add(`${path}.lie.replaces`, `差し替え対象の事実が存在しない: ${String(lie.replaces)}`);
      return;
    }
    if (replaced.owner !== entry.culprit) {
      issues.add(`${path}.lie.replaces`, `差し替え対象 ${replaced.id} の所有者が犯人ではない（所有者: ${replaced.owner}）`);
    }
    if (!isNonEmptyString(lie.value)) {
      issues.add(`${path}.lie.value`, "lie.valueが空である");
    } else if (factValues.has(lie.value)) {
      issues.add(`${path}.lie.value`, `lie.valueが正直な事実のvalueと衝突している: ${lie.value}`);
    }

    if (!Array.isArray(entry.contradictions) || entry.contradictions.length === 0) {
      issues.add(`${path}.contradictions`, "contradictionsは1件以上の配列である必要がある");
      return;
    }

    const yieldsInVariant = new Set<string>();
    entry.contradictions.forEach((contradiction: unknown, cIndex: number) => {
      if (isRecord(contradiction) && isNonEmptyString(contradiction.yields)) {
        if (yieldsInVariant.has(contradiction.yields)) {
          issues.add(`${path}.contradictions[${cIndex}].yields`, `同一バリアント内でyieldsが重複している: ${contradiction.yields}`);
        }
        yieldsInVariant.add(contradiction.yields);
      }
    });

    entry.contradictions.forEach((contradiction: unknown, cIndex: number) => {
      checkContradiction(
        contradiction,
        `${path}.contradictions[${cIndex}]`,
        { facts, lieFactId: replaced.id, yieldsInVariant, factValues },
        issues,
      );
    });

    variants.push(entry as unknown as Variant);
  });

  return variants;
}

/** 事件データ（JSONをパースした値）の構造を検証する */
export function parseCase(input: unknown): ParseResult {
  const issues = new IssueCollector();

  if (!isRecord(input)) {
    issues.add("", "事件データはオブジェクトである必要がある");
    return { ok: false, issues: issues.issues };
  }

  if (!isNonEmptyString(input.id)) {
    issues.add("id", "idが空である");
  }
  if (!isNonEmptyString(input.title)) {
    issues.add("title", "titleが空である");
  }
  if (
    !Array.isArray(input.playerCount) ||
    input.playerCount.length !== 2 ||
    !input.playerCount.every((n: unknown) => typeof n === "number" && Number.isInteger(n)) ||
    input.playerCount[0] > input.playerCount[1]
  ) {
    issues.add("playerCount", "playerCountは[最小, 最大]の整数2要素である必要がある");
  }

  const characters = checkCharacters(input.characters, issues);
  const facts = characters.length > 0 ? checkFacts(input.facts, characters, issues) : [];
  if (characters.length > 0 && facts.length > 0) {
    checkVariants(input.variants, characters, facts, issues);
  }

  if (issues.hasIssue) {
    return { ok: false, issues: issues.issues };
  }
  return { ok: true, value: input as unknown as Case };
}

/** 検証や導出で使う索引 */
export function indexFacts(target: Case): Map<string, Fact> {
  return new Map(target.facts.map((fact) => [fact.id, fact]));
}

/** バリアントのyieldsシンボル一覧 */
export function yieldsOf(variant: Variant): string[] {
  return variant.contradictions.map((contradiction: Contradiction) => contradiction.yields);
}
