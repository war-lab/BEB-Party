// ENGLISH RANKINGのお題データ検証。検証14項目を実装する（基本設計/10_ENGLISHRANKINGゲームモジュール.md）。
//
// 推論エンジンを使わない。5項目の全順列（120通り）の総当たりと計数だけで足りる。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import type { ValidationResult } from "@beb/shared-core";
import {
  DIFFICULTY_SHAPE,
  GOALS_PER_SET,
  ITEMS_PER_SET,
  MIN_HINTS,
  MIN_SETS,
  achieves,
  difficultyOf,
  goalKey,
  permutations,
  type RankingPack,
  type RankingSet,
} from "@beb/shared-ranking";
import { parsePack } from "./pack-schema";

/** 検証項目。1〜14は10の検証項目、schemaは前提となる構造検証 */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | "schema";

export interface Finding {
  packId: string;
  /** セット単位の項目のみ。パック単位の項目はnull */
  setId: string | null;
  item: ValidationItem;
  severity: "error" | "warning";
  message: string;
  detail: string[];
}

export interface ValidationReport {
  packId: string;
  findings: Finding[];
  errorCount: number;
  warningCount: number;
}

class Findings {
  readonly items: Finding[] = [];

  constructor(private readonly packId: string) {}

  error(item: ValidationItem, setId: string | null, message: string, detail: string[] = []): void {
    this.items.push({ packId: this.packId, setId, item, severity: "error", message, detail });
  }
}

/** 順位を読める形へ整形する。反例に出す */
function formatRanking(ranking: readonly string[]): string {
  return ranking.map((itemId, index) => `${index + 1}.${itemId}`).join(" ");
}

/** 検証4: 項目がちょうど5件で、idが一意 */
function checkItems(set: RankingSet, findings: Findings): void {
  if (set.items.length !== ITEMS_PER_SET) {
    findings.error(4, set.id, `項目は${ITEMS_PER_SET}件である必要がある`, [`実際: ${set.items.length}件`]);
  }
  const seen = new Set<string>();
  for (const item of set.items) {
    if (seen.has(item.id)) {
      findings.error(4, set.id, "項目のidが重複している", [`id: ${item.id}`]);
    }
    seen.add(item.id);
  }
}

/** 検証5: 目標がちょうど6件で、idが一意 */
function checkGoalCount(set: RankingSet, findings: Findings): void {
  if (set.goals.length !== GOALS_PER_SET) {
    findings.error(5, set.id, `目標は${GOALS_PER_SET}件である必要がある`, [`実際: ${set.goals.length}件`]);
  }
  const seen = new Set<string>();
  for (const card of set.goals) {
    if (seen.has(card.id)) {
      findings.error(5, set.id, "目標のidが重複している", [`id: ${card.id}`]);
    }
    seen.add(card.id);
  }
}

/**
 * 検証6: 難度の構成が 1,1,2,2,3,3 である。
 *
 * 5人のときは難度3を1枚落として配るため、難度3が2枚必要である（10の目標の割り当て）。
 */
function checkDifficultyShape(set: RankingSet, findings: Findings): void {
  const actual = set.goals.map((card) => card.difficulty).sort();
  const expected = [...DIFFICULTY_SHAPE];
  if (actual.join(",") !== expected.join(",")) {
    findings.error(6, set.id, `難度の構成が ${expected.join(",")} でない`, [`実際: ${actual.join(",")}`]);
  }
}

/** 検証7: 述語が参照する項目が存在する。検証8: withinとrankが1〜5 */
function checkGoalReferences(set: RankingSet, findings: Findings): void {
  const itemIds = new Set(set.items.map((item) => item.id));
  for (const card of set.goals) {
    const { goal } = card;
    if (!itemIds.has(goal.item)) {
      findings.error(7, set.id, "述語のitemが項目に存在しない", [`目標: ${card.id}`, `item: ${goal.item}`]);
    }
    if (goal.type === "above") {
      if (!itemIds.has(goal.than)) {
        findings.error(7, set.id, "述語のthanが項目に存在しない", [`目標: ${card.id}`, `than: ${goal.than}`]);
      }
      if (goal.item === goal.than) {
        findings.error(7, set.id, "aboveのitemとthanが同じ項目である", [`目標: ${card.id}`]);
      }
      continue;
    }
    const bound = goal.type === "exact" ? goal.rank : goal.within;
    if (bound < 1 || bound > ITEMS_PER_SET) {
      findings.error(8, set.id, `順位の指定は1以上${ITEMS_PER_SET}以下である必要がある`, [
        `目標: ${card.id}`,
        `指定: ${bound}`,
      ]);
    }
  }
}

/** 検証9: 宣言した難度が述語の型から導く難度と一致する */
function checkDeclaredDifficulty(set: RankingSet, findings: Findings): void {
  for (const card of set.goals) {
    const derived = difficultyOf(card.goal);
    if (card.difficulty !== derived) {
      findings.error(9, set.id, "宣言した難度が述語から導く難度と違う", [
        `目標: ${card.id}`,
        `宣言: ${card.difficulty}`,
        `述語から: ${derived}`,
      ]);
    }
  }
}

/** 検証10: 同じ述語を持つ目標が2枚ない */
function checkGoalUnique(set: RankingSet, findings: Findings): void {
  const seen = new Map<string, string>();
  for (const card of set.goals) {
    const key = goalKey(card.goal);
    const owner = seen.get(key);
    if (owner !== undefined) {
      findings.error(10, set.id, "同じ述語を持つ目標が2枚ある", [`目標: ${owner} と ${card.id}`, `述語: ${key}`]);
      continue;
    }
    seen.set(key, card.id);
  }
}

/**
 * 検証11〜13: 全順列の総当たり。
 *
 * 11: 各目標が達成可能であること（達成不可能な目標を配らない）
 * 12: 6枚を同時に達成できる順位が存在しないこと（対立が消えない）
 * 13: 同時達成の最大が3枚以上であること（協調の余地がある）
 */
function checkSatisfiability(set: RankingSet, findings: Findings): void {
  const itemIds = set.items.map((item) => item.id);
  if (itemIds.length !== ITEMS_PER_SET) {
    // 検証4で報告済み。総当たりの意味が失われるためここは走らせない
    return;
  }
  const all = permutations(itemIds);

  let best = 0;
  let bestRanking: string[] = [];
  const feasible = new Set<string>();

  for (const ranking of all) {
    let count = 0;
    for (const card of set.goals) {
      if (achieves(card.goal, ranking)) {
        feasible.add(card.id);
        count += 1;
      }
    }
    if (count > best) {
      best = count;
      bestRanking = ranking;
    }
  }

  for (const card of set.goals) {
    if (!feasible.has(card.id)) {
      findings.error(11, set.id, "どの順位でも達成できない目標がある", [`目標: ${card.id}`, `述語: ${goalKey(card.goal)}`]);
    }
  }

  if (best >= set.goals.length && set.goals.length > 0) {
    findings.error(12, set.id, "全ての目標を同時に達成できる順位がある（対立が生まれない）", [
      `順位: ${formatRanking(bestRanking)}`,
    ]);
  }

  const MIN_SIMULTANEOUS = 3;
  if (best < MIN_SIMULTANEOUS) {
    findings.error(13, set.id, `同時に達成できる目標の最大が${MIN_SIMULTANEOUS}未満である（協調の余地がない）`, [
      `最大: ${best}枚`,
      `そのときの順位: ${formatRanking(bestRanking)}`,
    ]);
  }
}

/** 検証14: 日本語文が空でなく、hintEnが3件以上 */
function checkDisplayCompleteness(set: RankingSet, findings: Findings): void {
  for (const card of set.goals) {
    if (card.ja.trim().length === 0) {
      findings.error(14, set.id, "目標の日本語文が空である", [`目標: ${card.id}`]);
    }
    if (card.hintEn.length < MIN_HINTS) {
      findings.error(14, set.id, `hintEnは${MIN_HINTS}件以上である必要がある`, [
        `目標: ${card.id}`,
        `実際: ${card.hintEn.length}件`,
      ]);
    }
  }
  if (set.keyExpressions.length === 0) {
    findings.error(14, set.id, "keyExpressionsが1件もない");
  }
  if (set.question.en.trim().length === 0 || set.question.ja.trim().length === 0) {
    findings.error(14, set.id, "questionのenまたはjaが空である");
  }
}

/** 検証3: セットidがパック内で一意 */
function checkSetIdUnique(pack: RankingPack, findings: Findings): void {
  const seen = new Set<string>();
  for (const set of pack.sets) {
    if (seen.has(set.id)) {
      findings.error(3, null, "セットidが重複している", [`id: ${set.id}`]);
    }
    seen.add(set.id);
  }
}

export function validatePack(content: unknown): ValidationReport {
  const parsed = parsePack(content);
  if (!parsed.ok) {
    const packId = typeof (content as { id?: unknown })?.id === "string" ? (content as { id: string }).id : "(unknown)";
    const findings = new Findings(packId);
    for (const issue of parsed.issues) {
      findings.error("schema", null, `${issue.path}: ${issue.message}`);
    }
    return report(packId, findings.items);
  }

  const pack = parsed.value;
  const findings = new Findings(pack.id);

  // 検証2: セット数の下限。1ゲームで3セット使うため、2ゲーム続けても重複しない下限を置く
  if (pack.sets.length < MIN_SETS) {
    findings.error(2, null, `セットは${MIN_SETS}件以上である必要がある`, [`実際: ${pack.sets.length}件`]);
  }
  checkSetIdUnique(pack, findings);

  for (const set of pack.sets) {
    checkItems(set, findings);
    checkGoalCount(set, findings);
    checkDifficultyShape(set, findings);
    checkGoalReferences(set, findings);
    checkDeclaredDifficulty(set, findings);
    checkGoalUnique(set, findings);
    checkSatisfiability(set, findings);
    checkDisplayCompleteness(set, findings);
  }

  return report(pack.id, findings.items);
}

function report(packId: string, findings: Finding[]): ValidationReport {
  return {
    packId,
    findings,
    errorCount: findings.filter((finding) => finding.severity === "error").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
  };
}

/** 反例の1件を1〜複数行へ整形する。欄は「パックid / セットid / 検証項目」の3点（10） */
export function formatFinding(finding: Finding): string {
  const item = typeof finding.item === "number" ? `検証${finding.item}` : finding.item;
  const set = finding.setId ?? "パック全体";
  const head = `[${finding.severity === "error" ? "ERROR" : "WARN"}] ${finding.packId} / ${set} / ${item}: ${finding.message}`;
  const detail = finding.detail.map((line) => `    - ${line}`);
  return [head, ...detail].join("\n");
}

/** GameModule.validateContent 互換の入口。詳細な反例が要るCLIは validatePack を使う */
export function validateContent(content: unknown): ValidationResult {
  const result = validatePack(content);
  if (result.errorCount === 0) {
    return { valid: true };
  }
  return {
    valid: false,
    reason: result.findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => formatFinding(finding))
      .join("\n"),
  };
}
