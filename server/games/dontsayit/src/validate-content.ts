// DON'T SAY ITのお題データ検証。検証7項目を実装する（基本設計/09_DONTSAYITゲームモジュール.md）。
//
// 推論エンジンを使わない。判定は文字列比較と枚数の計数だけで足りる。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import type { ValidationResult } from "@beb/shared-core";
import { MIN_CARDS, TABOO_PER_CARD, type Card, type TabooSet } from "@beb/shared-dontsayit";
import { parseSet } from "./set-schema";

/** 検証項目。1〜7は09の検証項目、schemaは前提となる構造検証 */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | "schema";

export interface Finding {
  setId: string;
  /** カード単位の項目のみ。セット単位の項目はnull */
  cardId: string | null;
  item: ValidationItem;
  severity: "error" | "warning";
  message: string;
  detail: string[];
}

export interface ValidationReport {
  setId: string;
  findings: Finding[];
  errorCount: number;
  warningCount: number;
}

/** 正解名を語に分解して小文字化する。検証1の比較単位（09） */
function wordsOf(answer: string): string[] {
  return answer
    .split(/[\s-]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0);
}

/** 禁止語を語に分解する。複合語（time machine）は許し、分割して比較する */
function tabooWordsOf(taboo: string): string[] {
  return wordsOf(taboo);
}

/** 正解名として許す文字。英字・空白・ハイフン・アポストロフィのみ（09の検証7） */
const ANSWER_PATTERN = /^[A-Za-z][A-Za-z\s'-]*$/;

class Findings {
  readonly items: Finding[] = [];

  constructor(private readonly setId: string) {}

  error(item: ValidationItem, cardId: string | null, message: string, detail: string[] = []): void {
    this.items.push({ setId: this.setId, cardId, item, severity: "error", message, detail });
  }
}

/** 検証1: 禁止語に正解名を構成する語が含まれない */
function checkAnswerNotExposed(card: Card, findings: Findings): void {
  const answerWords = wordsOf(card.answer);
  for (const taboo of card.taboo) {
    for (const tabooWord of tabooWordsOf(taboo)) {
      const hit = answerWords.find((word) => word === tabooWord || word.includes(tabooWord) || tabooWord.includes(word));
      if (hit !== undefined) {
        findings.error(1, card.id, "禁止語が正解名を構成する語と一致している", [
          `正解: ${card.answer}`,
          `禁止語: ${taboo}`,
          `一致した語: ${hit}`,
        ]);
      }
    }
  }
}

/** 検証2: 1枚のカード内で禁止語が重複しない */
function checkNoDuplicateTaboo(card: Card, findings: Findings): void {
  const seen = new Set<string>();
  for (const taboo of card.taboo) {
    const key = taboo.trim().toLowerCase();
    if (seen.has(key)) {
      findings.error(2, card.id, "禁止語が重複している", [`重複: ${taboo}`]);
    }
    seen.add(key);
  }
}

/** 検証3: 禁止語がちょうど5語。提示数はレベルで変えるが収録数は固定する（09） */
function checkTabooCount(card: Card, findings: Findings): void {
  if (card.taboo.length !== TABOO_PER_CARD) {
    findings.error(3, card.id, `禁止語は${TABOO_PER_CARD}語である必要がある`, [`実際: ${card.taboo.length}語`]);
  }
}

/** 検証7: 正解名の文字種 */
function checkAnswerCharacters(card: Card, findings: Findings): void {
  if (!ANSWER_PATTERN.test(card.answer)) {
    findings.error(7, card.id, "正解名は英字・空白・ハイフン・アポストロフィのみで構成する", [`実際: ${card.answer}`]);
  }
}

/** 検証6: 表示に使うフィールドが揃っている。構造検証を通っていれば空文字だけを見れば足りる */
function checkDisplayCompleteness(target: TabooSet, findings: Findings): void {
  if (target.keyExpressions.length === 0) {
    findings.error(6, null, "keyExpressionsが1件もない");
  }
}

export function validateSet(content: unknown): ValidationReport {
  const parsed = parseSet(content);
  if (!parsed.ok) {
    const setId = typeof (content as { id?: unknown } | null)?.id === "string" ? ((content as { id: string }).id) : "(不明)";
    const findings = new Findings(setId);
    for (const issue of parsed.issues) {
      findings.error("schema", null, issue.message, [issue.path]);
    }
    return report(setId, findings.items);
  }

  const target = parsed.value;
  const findings = new Findings(target.id);

  for (const card of target.cards) {
    checkTabooCount(card, findings);
    checkNoDuplicateTaboo(card, findings);
    checkAnswerNotExposed(card, findings);
    checkAnswerCharacters(card, findings);
  }

  // 検証4: 山札の枚数
  if (target.cards.length < MIN_CARDS) {
    findings.error(4, null, `カードは${MIN_CARDS}枚以上である必要がある`, [`実際: ${target.cards.length}枚`]);
  }

  // 検証5: 制約カードの存在。レベル5の説明者へ配るため1枚以上必要である
  if (target.constraints.length === 0) {
    findings.error(5, null, "constraintsが1件もない");
  }

  checkDisplayCompleteness(target, findings);

  return report(target.id, findings.items);
}

function report(setId: string, findings: Finding[]): ValidationReport {
  return {
    setId,
    findings,
    errorCount: findings.filter((finding) => finding.severity === "error").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
  };
}

/** 反例の1件を1〜複数行へ整形する。欄は「セットid / カードid / 検証項目」の3点（09） */
export function formatFinding(finding: Finding): string {
  const item = typeof finding.item === "number" ? `検証${finding.item}` : finding.item;
  const card = finding.cardId ?? "セット全体";
  const head = `[${finding.severity === "error" ? "ERROR" : "WARN"}] ${finding.setId} / ${card} / ${item}: ${finding.message}`;
  const detail = finding.detail.map((line) => `    - ${line}`);
  return [head, ...detail].join("\n");
}

/** GameModule.validateContent 互換の入口。詳細な反例が要るCLIは validateSet を使う */
export function validateContent(content: unknown): ValidationResult {
  const result = validateSet(content);
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
