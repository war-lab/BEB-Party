// ESCAPE CALLの舞台パック検証。検証10項目を実装する（基本設計/13_ESCAPECALLゲームモジュール.md）。
//
// 判定は件数・文字列の有無・穴の数え上げだけで足りる。英文の意味を判定しない（不変条件1）。
// 錠はコンテンツに持たないため、可解性はここでは見ない。生成のユニットテストが見る（ADR-0027）。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import {
  COLOR_PLACEHOLDER,
  LOCK_COUNT,
  MIN_KEY_EXPRESSIONS,
  PACK_ID_PATTERN,
  RULE_IDS,
  SHAPE_PLACEHOLDER,
  countOccurrences,
  placeholderOf,
  type EscapeCallPack,
  type RuleId,
} from "@beb/shared-escapecall";
import type { ValidationResult } from "@beb/shared-core";
import { parsePack } from "./pack-schema";

/** 検証項目。1〜10は13の検証項目、schemaは前提となる構造検証（検証1） */
export type ValidationItem = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | "schema";

export interface Finding {
  packId: string;
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

  error(item: ValidationItem, message: string, detail: string[] = []): void {
    this.items.push({ packId: this.packId, item, severity: "error", message, detail });
  }
}

function report(packId: string, findings: Finding[]): ValidationReport {
  return {
    packId,
    findings,
    errorCount: findings.filter((finding) => finding.severity === "error").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
  };
}

/**
 * 検証4: rulePhrases が、コードに定義されたすべての規則IDの言い回しを持ち、未知の規則IDを持たない。
 * 規則を足したときの言い回しの書き漏らしを落とす（ADR-0027の影響）。
 */
function checkRuleCoverage(pack: EscapeCallPack, findings: Findings): void {
  const present = Object.keys(pack.rulePhrases);
  for (const ruleId of RULE_IDS) {
    if (!present.includes(ruleId)) {
      findings.error(4, "規則の言い回しが欠けている", [`ruleId: ${ruleId}`]);
    }
  }
  for (const ruleId of present) {
    if (!(RULE_IDS as readonly string[]).includes(ruleId)) {
      findings.error(4, "コードに無い規則IDの言い回しがある", [`ruleId: ${ruleId}`]);
    }
  }
}

/**
 * 検証5〜8: 各規則の3文が空でなく、穴の過不足が無い。
 *
 * 穴が無い文では除く対象が伝わらず、余分な穴は置き換えられずに {color} のまま画面に出る（13の検証項目）。
 */
function checkRulePhrases(pack: EscapeCallPack, findings: Findings): void {
  for (const ruleId of RULE_IDS) {
    const phrase = pack.rulePhrases[ruleId as RuleId];
    if (phrase === undefined) {
      continue;
    }
    const expected = placeholderOf(ruleId);
    const item: ValidationItem = ruleId === "skip_color" ? 6 : ruleId === "skip_shape" ? 7 : 8;
    for (const tier of ["easy", "standard", "ja"] as const) {
      const text = phrase[tier];
      if (text.trim().length === 0) {
        findings.error(5, "規則の言い回しが空である", [`${ruleId}.${tier}`]);
        continue;
      }
      const colors = countOccurrences(text, COLOR_PLACEHOLDER);
      const shapes = countOccurrences(text, SHAPE_PLACEHOLDER);
      const wantColor = expected === COLOR_PLACEHOLDER ? 1 : 0;
      const wantShape = expected === SHAPE_PLACEHOLDER ? 1 : 0;
      if (colors !== wantColor || shapes !== wantShape) {
        findings.error(item, `穴の数が違う（${COLOR_PLACEHOLDER} ${wantColor}回、${SHAPE_PLACEHOLDER} ${wantShape}回が必要）`, [
          `${ruleId}.${tier}: ${text}`,
        ]);
      }
    }
  }
}

/** 検証10: すべての ja が空でない。ja はフォントサブセットの入力になる（基本設計/07） */
function checkJapanese(pack: EscapeCallPack, findings: Findings): void {
  const texts = [
    ["scene.titleJa", pack.scene.titleJa],
    ["scene.introJa", pack.scene.introJa],
    ...pack.lockLabels.map((label, index) => [`lockLabels[${index}].ja`, label.ja]),
    ...pack.keyExpressions.map((entry, index) => [`keyExpressions[${index}].ja`, entry.ja]),
  ];
  for (const [path, text] of texts) {
    if ((text ?? "").trim().length === 0) {
      findings.error(10, "日本語が空である", [path ?? ""]);
    }
  }
}

export function validatePack(content: unknown): ValidationReport {
  const parsed = parsePack(content);
  if (!parsed.ok) {
    const packId = typeof (content as { id?: unknown })?.id === "string" ? (content as { id: string }).id : "(unknown)";
    const findings = new Findings(packId);
    for (const issue of parsed.issues) {
      findings.error("schema", `${issue.path}: ${issue.message}`);
    }
    return report(packId, findings.items);
  }

  const pack = parsed.value;
  const findings = new Findings(pack.id);

  // 検証2: idの形
  if (!PACK_ID_PATTERN.test(pack.id)) {
    findings.error(2, "idは小文字英数字とアンダースコアの1〜16文字である必要がある", [`id: ${pack.id}`]);
  }

  // 検証3: 錠の名前はちょうど3件
  if (pack.lockLabels.length !== LOCK_COUNT) {
    findings.error(3, `lockLabelsはちょうど${LOCK_COUNT}件である必要がある`, [`実際: ${pack.lockLabels.length}件`]);
  }

  checkRuleCoverage(pack, findings);
  checkRulePhrases(pack, findings);

  // 検証9: keyExpressionsの下限
  if (pack.keyExpressions.length < MIN_KEY_EXPRESSIONS) {
    findings.error(9, `keyExpressionsは${MIN_KEY_EXPRESSIONS}件以上である必要がある`, [
      `実際: ${pack.keyExpressions.length}件`,
    ]);
  }

  checkJapanese(pack, findings);

  return report(pack.id, findings.items);
}

export function formatFinding(finding: Finding): string {
  const item = typeof finding.item === "number" ? `検証${finding.item}` : finding.item;
  const head = `[${finding.severity === "error" ? "ERROR" : "WARN"}] ${finding.packId} / ${item}: ${finding.message}`;
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
