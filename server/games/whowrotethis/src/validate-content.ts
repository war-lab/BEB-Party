// WHO WROTE THIS?の質問データ検証。検証9項目を実装する（基本設計/11_WHOWROTETHISゲームモジュール.md）。
//
// 判定は件数・一意性・語数の計数だけで足りる。英文の意味を判定しない（不変条件1）。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import type { ValidationResult } from "@beb/shared-core";
import {
  MIN_HINTS,
  MIN_KEY_EXPRESSIONS,
  MIN_QUESTIONS,
  MIN_WORDS,
  countWords,
  normalizeSubmission,
  type Question,
  type WhoWroteThisPack,
} from "@beb/shared-whowrotethis";
import { parsePack } from "./pack-schema";

/** 検証項目。1〜9は11の検証項目、schemaは前提となる構造検証 */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "schema";

export interface Finding {
  packId: string;
  /** 質問単位の項目のみ。パック単位の項目はnull */
  questionId: string | null;
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

  error(item: ValidationItem, questionId: string | null, message: string, detail: string[] = []): void {
    this.items.push({ packId: this.packId, questionId, item, severity: "error", message, detail });
  }
}

/** 検証3: 質問idがパック内で一意 */
function checkQuestionIdUnique(pack: WhoWroteThisPack, findings: Findings): void {
  const seen = new Set<string>();
  for (const question of pack.questions) {
    if (seen.has(question.id)) {
      findings.error(3, null, "質問のidが重複している", [`id: ${question.id}`]);
    }
    seen.add(question.id);
  }
}

/** 検証4: enが `?` で終わる。質問として読めない文を落とす */
function checkQuestionMark(question: Question, findings: Findings): void {
  if (!question.en.trimEnd().endsWith("?")) {
    findings.error(4, question.id, "enは疑問符で終わる必要がある", [`en: ${question.en}`]);
  }
}

/** 検証5: enとjaが空でない。構造検証が空文字を落とすため、ここでは空白のみを見る */
function checkDisplayCompleteness(question: Question, findings: Findings): void {
  if (question.en.trim() === "") {
    findings.error(5, question.id, "enが空白のみである");
  }
  if (question.ja.trim() === "") {
    findings.error(5, question.id, "jaが空白のみである");
  }
}

/** 検証6: hintEnが3件以上。レベル1〜2へ3件渡す設計に合わせる */
function checkHintCount(question: Question, findings: Findings): void {
  if (question.hintEn.length < MIN_HINTS) {
    findings.error(6, question.id, `hintEnは${MIN_HINTS}件以上である必要がある`, [
      `実際: ${question.hintEn.length}件`,
    ]);
  }
}

/**
 * 検証7: hintEnの各文が最低語数以上。
 *
 * hintEnをそのまま書き写した提出が too_short で拒否される状態を作らないためである（11の検証項目）。
 */
function checkHintLength(question: Question, findings: Findings): void {
  for (const hint of question.hintEn) {
    const words = countWords(normalizeSubmission(hint));
    if (words < MIN_WORDS) {
      findings.error(7, question.id, `hintEnは${MIN_WORDS}語以上である必要がある`, [`${words}語: ${hint}`]);
    }
  }
}

/** 検証9: 正規化したenが一致する質問が2件ない */
function checkQuestionTextUnique(pack: WhoWroteThisPack, findings: Findings): void {
  const seen = new Map<string, string>();
  for (const question of pack.questions) {
    const key = normalizeSubmission(question.en).toLowerCase();
    const owner = seen.get(key);
    if (owner !== undefined) {
      findings.error(9, question.id, "同じ質問文が2件ある", [`同綴り: ${owner}`, `en: ${question.en}`]);
    }
    seen.set(key, question.id);
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

  // 検証2: 質問数の下限。1ゲームで2問使うため、抽選に選択の余地が残る最小を置く
  if (pack.questions.length < MIN_QUESTIONS) {
    findings.error(2, null, `質問は${MIN_QUESTIONS}件以上である必要がある`, [`実際: ${pack.questions.length}件`]);
  }
  // 検証8: keyExpressionsの下限。指名の議論に使う言い回しはパック直下に持つ
  if (pack.keyExpressions.length < MIN_KEY_EXPRESSIONS) {
    findings.error(8, null, `keyExpressionsは${MIN_KEY_EXPRESSIONS}件以上である必要がある`, [
      `実際: ${pack.keyExpressions.length}件`,
    ]);
  }
  checkQuestionIdUnique(pack, findings);
  checkQuestionTextUnique(pack, findings);

  for (const question of pack.questions) {
    checkQuestionMark(question, findings);
    checkDisplayCompleteness(question, findings);
    checkHintCount(question, findings);
    checkHintLength(question, findings);
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

/** 反例の1件を1〜複数行へ整形する。欄は「パックid / 質問id / 検証項目」の3点 */
export function formatFinding(finding: Finding): string {
  const item = typeof finding.item === "number" ? `検証${finding.item}` : finding.item;
  const question = finding.questionId ?? "パック全体";
  const head = `[${finding.severity === "error" ? "ERROR" : "WARN"}] ${finding.packId} / ${question} / ${item}: ${finding.message}`;
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
