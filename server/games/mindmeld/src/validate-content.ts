// MIND MELDのお題パック検証。検証7項目を実装する（基本設計/15_MINDMELDゲームモジュール.md の検証項目）。
//
// 判定は件数・文字の種類・語数・重複だけで足りる。お題の意味や答えの範囲は判定しない（不変条件1）。
// 答えの範囲の広さと支配的な答えの有無は、人手のレビューで見る（15の「機械で検査しないもの」）。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import type { ValidationResult } from "@beb/shared-core";
import { MAX_ROUNDS, normalizeWord, type MindMeldPack } from "@beb/shared-mindmeld";
import { parsePack } from "./pack-schema";

/** 検証の閾値（15の検証項目） */
export const THRESHOLDS = {
  /** お題の件数の下限。MAX_ROUNDS の3倍（検証3） */
  minPrompts: MAX_ROUNDS * 3,
  /** お題の en の語数（検証4） */
  promptWords: { min: 2, max: 8 },
  /** お題の en の文字数の上限（検証4） */
  promptMaxChars: 60,
  /** keyExpressions の下限（検証6） */
  minKeyExpressions: 5,
} as const;

/** 検証項目。15の検証項目の番号。1は構造検証（pack-schema.ts） */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Finding {
  packId: string;
  /** お題単位の項目のみ。パック単位の項目はnull */
  promptId: string | null;
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

  error(item: ValidationItem, promptId: string | null, message: string, detail: string[] = []): void {
    this.items.push({ packId: this.packId, promptId, item, severity: "error", message, detail });
  }
}

const ID_PATTERN = /^[a-z0-9_]{1,16}$/u;

/** お題の en に使える文字。usedKeys の初期値を英字と空白で区切れることを保証する（15の検証4） */
const PROMPT_EN_PATTERN = /^[A-Za-z ,'?-]+$/u;

function checkIds(pack: MindMeldPack, findings: Findings): void {
  if (!ID_PATTERN.test(pack.id)) {
    findings.error(2, null, "パックのidは [a-z0-9_] の1〜16文字である必要がある", [`id: ${pack.id}`]);
  }
  const seen = new Set<string>();
  for (const prompt of pack.prompts) {
    if (!ID_PATTERN.test(prompt.id)) {
      findings.error(2, prompt.id, "お題のidは [a-z0-9_] の1〜16文字である必要がある");
    }
    if (seen.has(prompt.id)) {
      findings.error(2, prompt.id, "お題のidが重複している");
    }
    seen.add(prompt.id);
  }
}

function checkPromptCount(pack: MindMeldPack, findings: Findings): void {
  if (pack.prompts.length < THRESHOLDS.minPrompts) {
    findings.error(3, null, `お題は${THRESHOLDS.minPrompts}件以上である必要がある`, [`実際: ${pack.prompts.length}件`]);
  }
}

function checkPromptText(pack: MindMeldPack, findings: Findings): void {
  for (const prompt of pack.prompts) {
    if (!PROMPT_EN_PATTERN.test(prompt.en)) {
      findings.error(4, prompt.id, "お題のenは英字、半角空白、' - , ? だけからなる必要がある", [`en: ${prompt.en}`]);
    }
    const words = prompt.en.split(" ").filter((element) => element !== "").length;
    if (words < THRESHOLDS.promptWords.min || words > THRESHOLDS.promptWords.max) {
      findings.error(4, prompt.id, `お題のenは${THRESHOLDS.promptWords.min}〜${THRESHOLDS.promptWords.max}語である必要がある`, [
        `en: ${prompt.en}`,
        `語数: ${words}`,
      ]);
    }
    if ([...prompt.en].length > THRESHOLDS.promptMaxChars) {
      findings.error(4, prompt.id, `お題のenは${THRESHOLDS.promptMaxChars}文字以内である必要がある`, [`en: ${prompt.en}`]);
    }
  }
}

/** 正規化した en の重複。大文字小文字、空白の数、前後の記号だけが違うお題を同じお題として扱う（15の検証5） */
function checkPromptDuplicates(pack: MindMeldPack, findings: Findings): void {
  const owners = new Map<string, string>();
  for (const prompt of pack.prompts) {
    const normalized = normalizeWord(prompt.en);
    const owner = owners.get(normalized);
    if (owner !== undefined) {
      findings.error(5, prompt.id, "お題のenを正規化した文字列が重複している", [`en: ${prompt.en}`, `先のお題: ${owner}`]);
    } else {
      owners.set(normalized, prompt.id);
    }
  }
}

function checkKeyExpressions(pack: MindMeldPack, findings: Findings): void {
  if (pack.keyExpressions.length < THRESHOLDS.minKeyExpressions) {
    findings.error(6, null, `keyExpressionsは${THRESHOLDS.minKeyExpressions}件以上である必要がある`, [
      `実際: ${pack.keyExpressions.length}件`,
    ]);
  }
}

/**
 * en と ja が空白だけでないこと（15の検証7）。
 *
 * ja はフォントサブセットの入力になる（基本設計/07）。空の欄は構造検証で落ちるため、ここは空白のみの欄を見る。
 */
function checkTexts(pack: MindMeldPack, findings: Findings): void {
  for (const prompt of pack.prompts) {
    if (prompt.en.trim() === "" || prompt.ja.trim() === "") {
      findings.error(7, prompt.id, "お題のenとjaが空白のみである");
    }
  }
  for (const [index, entry] of pack.keyExpressions.entries()) {
    if (entry.en.trim() === "" || entry.ja.trim() === "") {
      findings.error(7, null, "keyExpressionsのenとjaが空白のみである", [`keyExpressions[${index}]`]);
    }
  }
  if (pack.title.trim() === "") {
    findings.error(7, null, "titleが空白のみである");
  }
}

export function validatePack(content: unknown): ValidationReport {
  const parsed = parsePack(content);
  if (!parsed.ok) {
    const packId = typeof (content as { id?: unknown })?.id === "string" ? (content as { id: string }).id : "(unknown)";
    const findings = new Findings(packId);
    for (const issue of parsed.issues) {
      findings.error(1, null, `${issue.path}: ${issue.message}`);
    }
    return report(packId, findings.items);
  }

  const pack = parsed.value;
  const findings = new Findings(pack.id);
  checkIds(pack, findings);
  checkPromptCount(pack, findings);
  checkPromptText(pack, findings);
  checkPromptDuplicates(pack, findings);
  checkKeyExpressions(pack, findings);
  checkTexts(pack, findings);
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

/** 反例の1件を1〜複数行へ整形する。欄は「パックid / お題id / 検証項目」の3点 */
export function formatFinding(finding: Finding): string {
  const target = finding.promptId ?? "パック全体";
  const head = `[${finding.severity === "error" ? "ERROR" : "WARN"}] ${finding.packId} / ${target} / 検証${finding.item}: ${finding.message}`;
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
