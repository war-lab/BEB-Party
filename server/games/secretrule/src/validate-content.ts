// SECRET RULE ENGLISHの規則パック検証。検証12項目を実装する（基本設計/14_SECRETRULEゲームモジュール.md の検証項目）。
//
// 判定は件数・範囲・判定関数の適用結果の割合だけで足りる。英文の意味を判定しない（不変条件1）。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import type { ValidationResult } from "@beb/shared-core";
import {
  END_MARKS,
  NUMBER_PARAM_RANGES,
  RULE_HOLES,
  RULE_IDS,
  SINGLE_LETTER_WORDS,
  STARTER_BLANK,
  WORD_LIST_RANGES,
  countWords,
  hasStarterBlank,
  isRuleId,
  isSubmittable,
  normalizeSubmission,
  type CandidateSpec,
  type PhraseHole,
  type SecretRulePack,
} from "@beb/shared-secretrule";
import { CORPUS, readCorpus, type Corpus } from "./corpus";
import { parsePack } from "./pack-schema";
import { comparisonKeyOf, lastMeaningfulCharOf, satisfies } from "./rules";

/**
 * 検証の閾値（14の検証項目）。いずれも未検証の仮置きであり、measurePack の出力を見て見直す。
 */
export const THRESHOLDS = {
  /** 候補の母集団の下限（検証3） */
  minCandidates: 8,
  /** 同じ規則IDの候補の上限（検証3） */
  maxSameRule: 2,
  /** 各候補を満たす文の割合（検証6） */
  passRate: { min: 0.15, max: 0.7 },
  /** 順序対 (X, Y) で X を満たし Y を満たさない文の割合の下限（検証7） */
  separationMin: 0.05,
  /**
   * 閾値すれすれを警告する幅（検証6・7）。合否は変えない。
   *
   * 文例集の1〜2件の増減で結果が反転する状態を、閾値を見直す材料として見えるようにする。
   */
  warnMargin: { passRate: 0.03, separation: 0.08 },
  /** 文例集の件数の下限（検証8） */
  minCorpus: 60,
  /** keyExpressions と starters の下限（検証9） */
  minKeyExpressions: 3,
  minStarters: 3,
  /** 文例集の構成（検証12） */
  corpusComposition: {
    question: { min: 0.15, max: 0.3 },
    exclamation: { min: 0.05, max: 0.15 },
    /** 語数の帯ごとの下限。3〜5、6〜9、10以上 */
    lengthBandMin: 0.2,
  },
} as const;

/** 検証項目。1〜12は14の検証項目、schemaは前提となる構造検証 */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | "schema";

export interface Finding {
  packId: string;
  /** 候補単位の項目のみ。パック単位の項目はnull */
  candidateId: string | null;
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

  error(item: ValidationItem, candidateId: string | null, message: string, detail: string[] = []): void {
    this.items.push({ packId: this.packId, candidateId, item, severity: "error", message, detail });
  }

  warning(item: ValidationItem, candidateId: string | null, message: string, detail: string[] = []): void {
    this.items.push({ packId: this.packId, candidateId, item, severity: "warning", message, detail });
  }
}

const ID_PATTERN = /^[a-z0-9_]{1,16}$/u;

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// --- 文例集で測る量 ---

export interface PackMeasurement {
  /** 候補id -> 文例集で満たす文の割合 */
  passRates: Record<string, number>;
  /** "X>Y" -> X を満たし Y を満たさない文の割合 */
  separations: Record<string, number>;
}

/**
 * 母集団の各候補の通過率と、全順序対の分離の割合を測る（14の検証6・7、テスト観点）。
 *
 * 閾値の見直しに使うため、検証とは別に結果だけを返す。
 */
export function measurePack(candidates: readonly CandidateSpec[], corpus: Corpus): PackMeasurement {
  const sentences = corpus.sentences.map((sentence) => normalizeSubmission(sentence));
  const total = Math.max(sentences.length, 1);
  const verdicts = new Map<string, boolean[]>();
  for (const candidate of candidates) {
    verdicts.set(
      candidate.id,
      sentences.map((sentence) => satisfies(candidate, sentence)),
    );
  }

  const passRates: Record<string, number> = {};
  for (const candidate of candidates) {
    const row = verdicts.get(candidate.id) ?? [];
    passRates[candidate.id] = row.filter(Boolean).length / total;
  }

  const separations: Record<string, number> = {};
  for (const x of candidates) {
    for (const y of candidates) {
      if (x.id === y.id) {
        continue;
      }
      const xs = verdicts.get(x.id) ?? [];
      const ys = verdicts.get(y.id) ?? [];
      separations[`${x.id}>${y.id}`] = xs.filter((passed, index) => passed && !ys[index]).length / total;
    }
  }
  return { passRates, separations };
}

// --- 各検証 ---

/** 検証2: id の形と、候補idの一意性 */
function checkIds(pack: SecretRulePack, findings: Findings): void {
  if (!ID_PATTERN.test(pack.id)) {
    findings.error(2, null, "パックのidは [a-z0-9_] の1〜16文字である必要がある", [`id: ${pack.id}`]);
  }
  const seen = new Set<string>();
  for (const candidate of pack.candidates) {
    if (!ID_PATTERN.test(candidate.id)) {
      findings.error(2, candidate.id, "候補のidは [a-z0-9_] の1〜16文字である必要がある");
    }
    if (seen.has(candidate.id)) {
      findings.error(2, candidate.id, "候補のidが重複している");
    }
    seen.add(candidate.id);
  }
}

/** 検証3: 候補が8件以上、同じ規則IDの候補が2件以下 */
function checkCandidateCount(pack: SecretRulePack, findings: Findings): void {
  if (pack.candidates.length < THRESHOLDS.minCandidates) {
    findings.error(3, null, `候補は${THRESHOLDS.minCandidates}件以上である必要がある`, [
      `実際: ${pack.candidates.length}件`,
    ]);
  }
  const counts = new Map<string, number>();
  for (const candidate of pack.candidates) {
    counts.set(candidate.ruleId, (counts.get(candidate.ruleId) ?? 0) + 1);
  }
  for (const [ruleId, count] of counts) {
    if (count > THRESHOLDS.maxSameRule) {
      findings.error(3, null, `同じ規則IDの候補は${THRESHOLDS.maxSameRule}件以下である必要がある`, [
        `${ruleId}: ${count}件`,
      ]);
    }
  }
}

/** 検証4: パラメータが規則IDごとの範囲に収まる */
function checkParams(candidate: CandidateSpec, findings: Findings): void {
  switch (candidate.ruleId) {
    case "min_words":
    case "max_words":
    case "long_word":
    case "short_words": {
      const range = NUMBER_PARAM_RANGES[candidate.ruleId];
      const n = candidate.params.n;
      if (!Number.isInteger(n) || n < range.min || n > range.max) {
        findings.error(4, candidate.id, `nは${range.min}以上${range.max}以下の整数である必要がある`, [`n: ${n}`]);
      }
      return;
    }
    case "has_word":
    case "no_word": {
      const range = WORD_LIST_RANGES[candidate.ruleId];
      const words = candidate.params.words;
      if (words.length < range.min || words.length > range.max) {
        findings.error(4, candidate.id, `wordsは${range.min}〜${range.max}語である必要がある`, [
          `実際: ${words.length}語`,
        ]);
      }
      const seen = new Set<string>();
      for (const word of words) {
        if (!/^[A-Za-z]+$/u.test(word)) {
          findings.error(4, candidate.id, "wordsの語は英字だけからなる必要がある", [`語: ${word}`]);
        }
        const lower = word.toLowerCase();
        if (lower.length === 1 && !(SINGLE_LETTER_WORDS as readonly string[]).includes(lower)) {
          findings.error(4, candidate.id, "1文字の語は a と I に限る", [`語: ${word}`]);
        }
        if (seen.has(lower)) {
          findings.error(4, candidate.id, "wordsが小文字に揃えて重複している", [`語: ${word}`]);
        }
        seen.add(lower);
      }
      return;
    }
    case "has_letter":
    case "no_letter":
    case "starts_with":
      if (!/^[a-z]$/u.test(candidate.params.letter)) {
        findings.error(4, candidate.id, "letterは a〜z の1文字である必要がある", [`letter: ${candidate.params.letter}`]);
      }
      return;
    case "ends_with":
      if (!(END_MARKS as readonly string[]).includes(candidate.params.mark)) {
        findings.error(4, candidate.id, `markは ${END_MARKS.join(" / ")} である必要がある`, [
          `mark: ${candidate.params.mark}`,
        ]);
      }
      return;
  }
}

const ALL_HOLES: readonly PhraseHole[] = ["n", "words", "letter", "mark"];

function countOccurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

/** 検証5: 言い回しが使う規則IDを網羅し、穴をちょうど1回ずつ含む */
function checkPhrases(pack: SecretRulePack, findings: Findings): void {
  for (const key of Object.keys(pack.rulePhrases)) {
    if (!isRuleId(key)) {
      findings.error(5, null, "rulePhrasesに未知の規則IDがある", [`規則ID: ${key}`]);
    }
  }
  const used = new Set(pack.candidates.map((candidate) => candidate.ruleId));
  for (const ruleId of RULE_IDS) {
    const phrase = pack.rulePhrases[ruleId];
    if (phrase === undefined) {
      if (used.has(ruleId)) {
        findings.error(5, null, "候補で使う規則IDの言い回しが無い", [`規則ID: ${ruleId}`]);
      }
      continue;
    }
    const hole = RULE_HOLES[ruleId];
    for (const [lang, text] of [
      ["en", phrase.en],
      ["ja", phrase.ja],
    ] as const) {
      if (countOccurrences(text, `{${hole}}`) !== 1) {
        findings.error(5, null, `言い回しは {${hole}} をちょうど1回含む必要がある`, [`${ruleId}.${lang}: ${text}`]);
      }
      for (const other of ALL_HOLES) {
        if (other !== hole && text.includes(`{${other}}`)) {
          findings.error(5, null, `言い回しに他の穴 {${other}} がある`, [`${ruleId}.${lang}: ${text}`]);
        }
      }
    }
  }
}

/** 検証6・7: 文例集での通過率と分離の割合 */
function checkMeasurement(pack: SecretRulePack, corpus: Corpus, findings: Findings): void {
  const measured = measurePack(pack.candidates, corpus);
  const { min, max } = THRESHOLDS.passRate;
  for (const candidate of pack.candidates) {
    const rate = measured.passRates[candidate.id] ?? 0;
    if (rate < min || rate > max) {
      findings.error(6, candidate.id, `文例集で満たす文の割合は${percent(min)}以上${percent(max)}以下である必要がある`, [
        `実際: ${percent(rate)}`,
      ]);
    } else if (rate < min + THRESHOLDS.warnMargin.passRate || rate > max - THRESHOLDS.warnMargin.passRate) {
      findings.warning(6, candidate.id, "文例集で満たす文の割合が閾値に近い", [`実際: ${percent(rate)}`]);
    }
  }
  for (const [pair, rate] of Object.entries(measured.separations)) {
    if (rate < THRESHOLDS.separationMin) {
      const [x, y] = pair.split(">");
      findings.error(
        7,
        x ?? null,
        `${x}を満たし${y}を満たさない文の割合は${percent(THRESHOLDS.separationMin)}以上である必要がある`,
        [`実際: ${percent(rate)}`],
      );
    } else if (rate < THRESHOLDS.warnMargin.separation) {
      const [x, y] = pair.split(">");
      findings.warning(7, x ?? null, `${x}を満たし${y}を満たさない文の割合が閾値に近い`, [`実際: ${percent(rate)}`]);
    }
  }
}

/** 検証8: 文例集の件数、各文の提出条件、比較キーの重複 */
function checkCorpus(corpus: Corpus, findings: Findings): void {
  if (corpus.sentences.length < THRESHOLDS.minCorpus) {
    findings.error(8, null, `文例集は${THRESHOLDS.minCorpus}件以上である必要がある`, [`実際: ${corpus.sentences.length}件`]);
  }
  const seen = new Map<string, string>();
  for (const sentence of corpus.sentences) {
    const normalized = normalizeSubmission(sentence);
    if (!isSubmittable(normalized)) {
      findings.error(8, null, "文例集の文が提出の条件（3語以上、140文字以内）を満たさない", [`文: ${sentence}`]);
    }
    const key = comparisonKeyOf(normalized);
    const owner = seen.get(key);
    if (owner !== undefined) {
      findings.error(8, null, "文例集に比較キーが同じ文がある", [`文: ${sentence}`, `先の文: ${owner}`]);
    }
    seen.set(key, sentence);
  }
}

/** 検証12: 文例集の構成の比率 */
function checkCorpusComposition(corpus: Corpus, findings: Findings): void {
  const sentences = corpus.sentences.map((sentence) => normalizeSubmission(sentence));
  const total = Math.max(sentences.length, 1);
  const rateOf = (predicate: (sentence: string) => boolean) => sentences.filter(predicate).length / total;
  const { question, exclamation, lengthBandMin } = THRESHOLDS.corpusComposition;

  const questionRate = rateOf((sentence) => lastMeaningfulCharOf(sentence) === "?");
  if (questionRate < question.min || questionRate > question.max) {
    findings.error(12, null, `? で終わる文の割合は${percent(question.min)}以上${percent(question.max)}以下である必要がある`, [
      `実際: ${percent(questionRate)}`,
    ]);
  }
  const exclamationRate = rateOf((sentence) => lastMeaningfulCharOf(sentence) === "!");
  if (exclamationRate < exclamation.min || exclamationRate > exclamation.max) {
    findings.error(
      12,
      null,
      `! で終わる文の割合は${percent(exclamation.min)}以上${percent(exclamation.max)}以下である必要がある`,
      [`実際: ${percent(exclamationRate)}`],
    );
  }
  const bands: [string, (words: number) => boolean][] = [
    ["3〜5語", (words) => words >= 3 && words <= 5],
    ["6〜9語", (words) => words >= 6 && words <= 9],
    ["10語以上", (words) => words >= 10],
  ];
  for (const [label, inBand] of bands) {
    const rate = rateOf((sentence) => inBand(countWords(sentence)));
    if (rate < lengthBandMin) {
      findings.error(12, null, `${label}の文の割合は${percent(lengthBandMin)}以上である必要がある`, [
        `実際: ${percent(rate)}`,
      ]);
    }
  }
}

/** 検証9・10・11: 言い回しと書き出しの例の件数と形 */
function checkTexts(pack: SecretRulePack, findings: Findings): void {
  if (pack.keyExpressions.length < THRESHOLDS.minKeyExpressions) {
    findings.error(9, null, `keyExpressionsは${THRESHOLDS.minKeyExpressions}件以上である必要がある`, [
      `実際: ${pack.keyExpressions.length}件`,
    ]);
  }
  if (pack.starters.length < THRESHOLDS.minStarters) {
    findings.error(9, null, `startersは${THRESHOLDS.minStarters}件以上である必要がある`, [`実際: ${pack.starters.length}件`]);
  }
  for (const starter of pack.starters) {
    if (!hasStarterBlank(starter.en)) {
      findings.error(10, null, `startersは空欄（${STARTER_BLANK}）を含む必要がある`, [`完成文: ${starter.en}`]);
    }
  }
  const japanese = [
    pack.title,
    ...pack.keyExpressions.map((entry) => entry.ja),
    ...pack.starters.map((entry) => entry.ja),
    ...Object.values(pack.rulePhrases).map((entry) => entry?.ja ?? ""),
  ];
  if (japanese.some((text) => text.trim() === "")) {
    findings.error(11, null, "jaとtitleが空白のみの項目がある");
  }
}

/**
 * パックを検証する。corpus を省略すると収録の文例集を使う。
 *
 * テストは corpus を渡して、文例集に依存しない形で各検証を確かめる。
 */
export function validatePack(content: unknown, corpusInput: unknown = CORPUS): ValidationReport {
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
  checkIds(pack, findings);
  checkCandidateCount(pack, findings);
  for (const candidate of pack.candidates) {
    checkParams(candidate, findings);
  }
  checkPhrases(pack, findings);
  checkTexts(pack, findings);

  const corpus = readCorpus(corpusInput);
  if (corpus === null) {
    findings.error(8, null, "文例集の形が壊れている（sentences は文字列の配列である必要がある）");
  } else {
    checkCorpus(corpus, findings);
    checkCorpusComposition(corpus, findings);
    // パラメータが範囲外の候補で割合を測っても反例が読めないため、検証4が通ったときだけ測る
    if (!findings.items.some((finding) => finding.item === 4)) {
      checkMeasurement(pack, corpus, findings);
    }
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

/** 反例の1件を1〜複数行へ整形する。欄は「パックid / 候補id / 検証項目」の3点 */
export function formatFinding(finding: Finding): string {
  const item = typeof finding.item === "number" ? `検証${finding.item}` : finding.item;
  const target = finding.candidateId ?? "パック全体";
  const head = `[${finding.severity === "error" ? "ERROR" : "WARN"}] ${finding.packId} / ${target} / ${item}: ${finding.message}`;
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
