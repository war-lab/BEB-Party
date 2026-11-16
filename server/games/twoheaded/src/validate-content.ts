// TWO-HEADED SPEAKERのお題セット検証。検証8項目を実装する（基本設計/16_TWOHEADEDゲームモジュール.md の検証項目）。
//
// 判定は文字の種類・件数・重複だけで足りる。お題を参加者が知っているか、1語ずつ交互に話す形で説明できるかは
// 判定しない（16の「機械で検査しないもの」。人手で確認し、お題レビュー/ に記録する）。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import type { ValidationResult } from "@beb/shared-core";
import { MIN_CARDS, type TwoHeadedSet } from "@beb/shared-twoheaded";
import { parseSet } from "./set-schema";

/** 検証の閾値（16の検証項目） */
export const THRESHOLDS = {
  /** 山札の下限。消費上限 × ペアの数の上限 × 周回数の上限（検証4） */
  minCards: MIN_CARDS,
  /** 別名の件数の上限（検証6） */
  maxAliases: 3,
  /** 書き出しの例の下限（検証7） */
  minStarters: 3,
  /** 重要表現の下限（検証7） */
  minKeyExpressions: 1,
} as const;

/** 検証項目。16の検証項目の番号。1は構造検証（set-schema.ts） */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

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

class Findings {
  readonly items: Finding[] = [];

  constructor(private readonly setId: string) {}

  error(item: ValidationItem, cardId: string | null, message: string, detail: string[] = []): void {
    this.items.push({ setId: this.setId, cardId, item, severity: "error", message, detail });
  }
}

/** お題名と別名の文字種。英字・空白・ハイフン・アポストロフィのみで、先頭が英字（16の検証2・検証6） */
const ANSWER_PATTERN = /^[A-Za-z][A-Za-z '-]*$/u;

/** 日本語の文字（ひらがな・カタカナ・漢字・々〆ー）（16の検証5。DON'T SAY ITの検証と同じ範囲） */
const JAPANESE_PATTERN = /[぀-ゟ゠-ヿ々〆ー一-鿿]/u;

/** 書き出しの例の空欄（16の検証7） */
const BLANK = "...";

/**
 * 重複の判定に使う正規化。大文字小文字、前後と連続の空白、ハイフンと空白の違いを揃える（16の検証3・検証6）。
 *
 * `ice-cream` と `ice cream` は説明役が言えない語として同じであり、同じセットに両方があると同じお題が2回出る。
 */
export function normalizeAnswer(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/-/gu, " ").replace(/\s+/gu, " ").trim();
}

function checkAnswerCharacters(set: TwoHeadedSet, findings: Findings): void {
  for (const card of set.cards) {
    if (!ANSWER_PATTERN.test(card.answer)) {
      findings.error(2, card.id, "answerは英字・空白・ハイフン・アポストロフィのみで構成し、先頭を英字にする", [
        `answer: ${card.answer}`,
      ]);
    }
  }
}

function checkAnswerDuplicates(set: TwoHeadedSet, findings: Findings): void {
  const owners = new Map<string, string>();
  for (const card of set.cards) {
    const key = normalizeAnswer(card.answer);
    const owner = owners.get(key);
    if (owner !== undefined) {
      findings.error(3, card.id, "正規化したanswerがセット内で重複している", [`answer: ${card.answer}`, `先のカード: ${owner}`]);
    } else {
      owners.set(key, card.id);
    }
  }
}

function checkCardCount(set: TwoHeadedSet, findings: Findings): void {
  if (set.cards.length < THRESHOLDS.minCards) {
    findings.error(4, null, `カードは${THRESHOLDS.minCards}枚以上である必要がある`, [`実際: ${set.cards.length}枚`]);
  }
}

function checkJapaneseNames(set: TwoHeadedSet, findings: Findings): void {
  for (const card of set.cards) {
    if (!JAPANESE_PATTERN.test(card.ja)) {
      findings.error(5, card.id, "jaに日本語の文字が含まれていない", [`ja: ${card.ja}`]);
    }
  }
}

function checkAliases(set: TwoHeadedSet, findings: Findings): void {
  for (const card of set.cards) {
    const aliases = card.aliases ?? [];
    if (aliases.length > THRESHOLDS.maxAliases) {
      findings.error(6, card.id, `別名は${THRESHOLDS.maxAliases}件以内とする`, [`実際: ${aliases.length}件`]);
    }
    const answerKey = normalizeAnswer(card.answer);
    for (const alias of aliases) {
      if (!ANSWER_PATTERN.test(alias)) {
        findings.error(6, card.id, "別名はanswerと同じ文字種（英字・空白・ハイフン・アポストロフィ、先頭は英字）にする", [
          `別名: ${alias}`,
        ]);
      }
      if (normalizeAnswer(alias) === answerKey) {
        findings.error(6, card.id, "別名がanswerと重複している", [`answer: ${card.answer}`, `別名: ${alias}`]);
      }
    }
  }
}

function checkStartersAndExpressions(set: TwoHeadedSet, findings: Findings): void {
  if (set.starters.length < THRESHOLDS.minStarters) {
    findings.error(7, null, `startersは${THRESHOLDS.minStarters}件以上である必要がある`, [`実際: ${set.starters.length}件`]);
  }
  for (const [index, starter] of set.starters.entries()) {
    if (!starter.en.includes(BLANK)) {
      findings.error(7, null, `startersの各文は空欄（${BLANK}）を含む必要がある`, [`starters[${index}]: ${starter.en}`]);
    }
  }
  if (set.keyExpressions.length < THRESHOLDS.minKeyExpressions) {
    findings.error(7, null, `keyExpressionsは${THRESHOLDS.minKeyExpressions}件以上である必要がある`, [
      `実際: ${set.keyExpressions.length}件`,
    ]);
  }
}

/**
 * 表示文言が空白だけでないこと（16の検証8）。
 *
 * ja はフォントサブセットの入力になる（基本設計/07）。空の欄は構造検証で落ちるため、ここは空白のみの欄を見る。
 */
function checkTexts(set: TwoHeadedSet, findings: Findings): void {
  if (set.title.trim() === "") {
    findings.error(8, null, "titleが空白のみである");
  }
  for (const card of set.cards) {
    if (card.answer.trim() === "" || card.ja.trim() === "") {
      findings.error(8, card.id, "answerかjaが空白のみである");
    }
  }
  for (const [name, entries] of [
    ["starters", set.starters],
    ["keyExpressions", set.keyExpressions],
  ] as const) {
    for (const [index, entry] of entries.entries()) {
      if (entry.en.trim() === "" || entry.ja.trim() === "") {
        findings.error(8, null, `${name}のenとjaが空白のみである`, [`${name}[${index}]`]);
      }
    }
  }
}

export function validateSet(content: unknown): ValidationReport {
  const parsed = parseSet(content);
  if (!parsed.ok) {
    const setId = typeof (content as { id?: unknown })?.id === "string" ? (content as { id: string }).id : "(unknown)";
    const findings = new Findings(setId);
    for (const issue of parsed.issues) {
      findings.error(1, null, `${issue.path}: ${issue.message}`);
    }
    return report(setId, findings.items);
  }

  const set = parsed.value;
  const findings = new Findings(set.id);
  checkAnswerCharacters(set, findings);
  checkAnswerDuplicates(set, findings);
  checkCardCount(set, findings);
  checkJapaneseNames(set, findings);
  checkAliases(set, findings);
  checkStartersAndExpressions(set, findings);
  checkTexts(set, findings);
  return report(set.id, findings.items);
}

function report(setId: string, findings: Finding[]): ValidationReport {
  return {
    setId,
    findings,
    errorCount: findings.filter((finding) => finding.severity === "error").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
  };
}

/** 反例の1件を1〜複数行へ整形する。欄は「セットid / カードid / 検証項目」の3点 */
export function formatFinding(finding: Finding): string {
  const target = finding.cardId ?? "セット全体";
  const head = `[${finding.severity === "error" ? "ERROR" : "WARN"}] ${finding.setId} / ${target} / 検証${finding.item}: ${finding.message}`;
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
