// DON'T SAY ITのお題データ検証。検証9項目を実装する（基本設計/09_DONTSAYITゲームモジュール.md）。
//
// 推論エンジンを使わない。判定は文字列比較と枚数の計数だけで足りる。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import type { ValidationResult } from "@beb/shared-core";
import { ALIASES_MAX, MIN_CARDS, TABOO_PER_CARD, type Card, type TabooSet } from "@beb/shared-dontsayit";
import { parseSet } from "./set-schema";

/** 検証項目。1〜13は09の検証項目、schemaは前提となる構造検証 */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | "schema";

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

/**
 * 検証1: 禁止語に正解名を構成する語が含まれない。
 *
 * 判定は語単位の完全一致とする。部分一致は採らない。
 * 部分一致で判定すると、正解に短い語が含まれる場合に無関係な禁止語まで拒否する
 * （`Winnie the Pooh` の `the` により `mother` / `brother` が書けなくなる。実測）。
 *
 * 正解の構成語は監視役へ渡す正解から暗黙に禁止されるため、明示的に書けなくても機能は失われない（09の3役）。
 */
function checkAnswerNotExposed(card: Card, findings: Findings): void {
  const answerWords = new Set(wordsOf(card.answer));
  for (const taboo of card.taboo) {
    for (const tabooWord of tabooWordsOf(taboo)) {
      if (answerWords.has(tabooWord)) {
        findings.error(1, card.id, "禁止語が正解名を構成する語と一致している", [
          `正解: ${card.answer}`,
          `禁止語: ${taboo}`,
          `一致した語: ${tabooWord}`,
        ]);
      }
    }
  }
}

/** 禁止語として許す文字。英字・空白・ハイフン・アポストロフィのみ（09の検証9） */
const TABOO_PATTERN = /^[A-Za-z][A-Za-z\s'-]*$/;

/** 禁止語1語の最大文字数。これを超える語は口頭で踏めず、枠が死ぬ */
const TABOO_WORD_MAX_LENGTH = 15;

/** 禁止語に許す最大語数。多語の言い換えは「その語を言ったか」を監視役が判定できない */
const TABOO_MAX_WORDS = 2;

/**
 * 検証10で複合語の構成要素として扱う最短の長さ。
 *
 * 2文字以下を構成要素として扱うと、`Ed Sheeran` の `red` のような無関係な語まで落ちる。
 * 3文字を下限にすると `rain` / `book` / `shoe` / `top` / `light` はいずれも捕まる。
 */
const MIN_COMPOUND_PART_LENGTH = 3;

/** 日本語の文字（ひらがな・カタカナ・漢字・長音符）を1文字でも含むか。検証11 */
const JAPANESE_PATTERN = /[\u3040-\u309f\u30a0-\u30ff\u3005\u3006\u30fc\u4e00-\u9fff]/;

/**
 * 検証9: 禁止語の形。
 *
 * 文字種を英字に限るのは、非ASCIIの禁止語がフォントサブセットの入力に含まれず豆腐になるためである
 * （`client/app/scripts/generate-font-subsets.mjs` は日本語フィールドからしか文字を集めない）。
 * 数字とアクセント付き文字は、検証1の完全一致をすり抜けて正解を露出させる経路にもなる。
 */
function checkTabooShape(card: Card, findings: Findings): void {
  for (const taboo of card.taboo) {
    if (!TABOO_PATTERN.test(taboo)) {
      findings.error(9, card.id, "禁止語は英字・空白・ハイフン・アポストロフィのみで構成する", [`実際: ${taboo}`]);
      continue;
    }
    const words = tabooWordsOf(taboo);
    if (words.length === 0) {
      findings.error(9, card.id, "禁止語が空白だけで構成されている", [`実際: ${JSON.stringify(taboo)}`]);
      continue;
    }
    if (words.length > TABOO_MAX_WORDS) {
      findings.error(9, card.id, `禁止語は${TABOO_MAX_WORDS}語以内とする`, [`実際: ${words.length}語（${taboo}）`]);
    }
    const tooLong = words.find((word) => word.length > TABOO_WORD_MAX_LENGTH);
    if (tooLong !== undefined) {
      findings.error(9, card.id, `禁止語の1語は${TABOO_WORD_MAX_LENGTH}文字以内とする`, [`実際: ${tooLong}`]);
    }
  }
}

/**
 * 検証10: 禁止語が正解の複合語の構成要素と一致しない。
 *
 * 遊び方は「お題の名前そのものと、その一部」を言えないものとし、複合語の構成要素を含める
 * （`raincoat` に対する `rain` / `coat`。09の言えない語の範囲）。
 * 規則で既に禁止されている語を禁止語の5枠に書くと、実効的な禁止語数がレベルごとにずれる。
 * このゲームは提示する禁止語の数で難度を調整するため、枠の目減りを無視できない。
 *
 * 判定は先頭一致と末尾一致に限り、複数形の `s` / `es` だけを吸収する。
 * 部分文字列一致は採らない。`Katniss Everdeen` の `cat`、`Bart Simpson` の `art` のような
 * 無関係な語まで拒否し、書ける禁止語がなくなる（09の言えない語の範囲でも部分文字列は除く）。
 *
 * 不規則な変化形（`toothbrush` に対する `teeth`）はこの検査では落ちない。
 * 語幹の同一性は文字列比較では判定できないため、卓の裁定に委ねる（09の禁止語の語形変化）。
 */
function checkTabooNotCompoundPart(card: Card, findings: Findings): void {
  const answerWords = wordsOf(card.answer);
  for (const taboo of card.taboo) {
    for (const tabooWord of tabooWordsOf(taboo)) {
      const stems = [tabooWord, tabooWord.replace(/es$/, ""), tabooWord.replace(/s$/, "")].filter(
        (stem) => stem.length >= MIN_COMPOUND_PART_LENGTH,
      );
      const hit = answerWords.find(
        (answerWord) =>
          answerWord.length > tabooWord.length &&
          stems.some((stem) => answerWord.startsWith(stem) || answerWord.endsWith(stem)),
      );
      if (hit !== undefined) {
        findings.error(10, card.id, "禁止語が正解の複合語の構成要素と一致している", [
          `正解: ${card.answer}`,
          `禁止語: ${taboo}`,
          `一致した構成要素: ${hit}`,
          "規則で既に禁止されているため、別の連想語へ差し替える",
        ]);
      }
    }
  }
}

/**
 * 検証11: 日本語名が入っている。
 *
 * 空文字と欠落は構造検証（`schema`）が落とすため、ここが見るのは
 * 「英語をそのまま複写していないか」だけである。
 * 日本語の文字が1文字も含まれない `ja` は、翻訳の書き忘れとして落とす。
 */
function checkJapaneseName(card: Card, findings: Findings): void {
  if (card.ja.length === 0) {
    return;
  }
  if (!JAPANESE_PATTERN.test(card.ja)) {
    findings.error(11, card.id, "日本語名に日本語の文字が含まれていない", [
      `正解: ${card.answer}`,
      `ja: ${card.ja}`,
    ]);
  }
}

/**
 * 検証12: 別名の形と重複。
 *
 * 別名は正解として受理する語であり、説明者も言えない（09の言えない語の範囲）。
 * 禁止語と同じ制約（文字種・語数・長さ）を課すのは、監視役が口頭で踏んだかを判定するためである。
 *
 * 禁止語との重複を落とすのは、同じ語が2箇所に出ると監視役の画面で二重に並ぶためである。
 * 正解の構成語との一致を落とすのは、別名として意味がないためである。
 */
function checkAliases(card: Card, findings: Findings): void {
  const aliases = card.aliases ?? [];
  if (aliases.length === 0) {
    return;
  }
  if (aliases.length > ALIASES_MAX) {
    findings.error(12, card.id, `別名は${ALIASES_MAX}件以内とする`, [`実際: ${aliases.length}件`]);
  }

  const answerWords = new Set(wordsOf(card.answer));
  const tabooKeys = new Set(card.taboo.map((entry) => entry.trim().toLowerCase()));
  const seen = new Set<string>();

  for (const alias of aliases) {
    if (!TABOO_PATTERN.test(alias)) {
      findings.error(12, card.id, "別名は英字・空白・ハイフン・アポストロフィのみで構成する", [`実際: ${alias}`]);
      continue;
    }
    const words = tabooWordsOf(alias);
    if (words.length > TABOO_MAX_WORDS) {
      findings.error(12, card.id, `別名は${TABOO_MAX_WORDS}語以内とする`, [`実際: ${words.length}語（${alias}）`]);
    }
    const tooLong = words.find((word) => word.length > TABOO_WORD_MAX_LENGTH);
    if (tooLong !== undefined) {
      findings.error(12, card.id, `別名の1語は${TABOO_WORD_MAX_LENGTH}文字以内とする`, [`実際: ${tooLong}`]);
    }

    const key = alias.trim().toLowerCase();
    if (seen.has(key)) {
      findings.error(12, card.id, "別名が重複している", [`重複: ${alias}`]);
    }
    seen.add(key);

    if (tabooKeys.has(key)) {
      findings.error(12, card.id, "別名が禁止語と重複している", [`重複: ${alias}`]);
    }
    if (words.every((word) => answerWords.has(word))) {
      findings.error(12, card.id, "別名が正解の構成語と一致している", [`正解: ${card.answer}`, `別名: ${alias}`]);
    }
  }
}

/**
 * 検証13: 禁止語の枠が、同じカードの別の枠と禁止範囲で重複しない。
 *
 * 検証2は枠まるごとの一致しか見ない。`cheek` と `red cheek` は別の文字列であるため通る。
 * しかし `cheek` が単独で禁止されていれば `red cheek` は絶対に言えないため、
 * 後者の枠は追加効果を持たない。読む負担だけが増え、難度は上がらない。
 *
 * このゲームは提示する禁止語の数で難度を調整する。
 * 実効的な制限数がカードごとに変わると、同じレベルでも引いたカードで負荷が変わる。
 *
 * 判定するのは次の2つである。
 *
 * 1. 複合語の枠の構成語が、同カードの別の枠として単独で禁止されている
 * 2. 単語の枠どうしで、複数形の `s` / `es` だけが違う
 *
 * 不規則変化（`children` と `child`）は文字列比較では判定できないため対象外とする。
 * 語形変化を同じ語とみなす規則は卓の裁定に委ねる（09の禁止語の語形変化）。
 */
function checkNoRedundantTaboo(card: Card, findings: Findings): void {
  const entries = card.taboo.map((entry) => ({ entry, words: tabooWordsOf(entry) }));
  const singles = new Map<string, string>();
  for (const { entry, words } of entries) {
    if (words.length === 1 && words[0] !== undefined && !singles.has(words[0])) {
      singles.set(words[0], entry);
    }
  }

  for (const [index, { entry, words }] of entries.entries()) {
    if (words.length >= 2) {
      // 単複差も吸収して照合する。完全一致だけで見ると `gloves` と `white glove` を見逃す。
      // 語形変化を同じ語とみなす規則があるため、`gloves` が禁止なら単数形も禁止であり、
      // `white glove` は絶対に言えない（09の禁止語の語形変化）
      const covered = words
        .map((word) => {
          const hit = [...singles.keys()].find((single) => sameStem(word, single));
          return hit === undefined ? undefined : { word, single: hit };
        })
        .filter((item): item is { word: string; single: string } => item !== undefined);
      const first = covered[0];
      if (first !== undefined) {
        findings.error(13, card.id, "複合語の禁止語の構成語が、別の枠で単独に禁止されている", [
          `枠: ${entry}`,
          `単独で禁止済み: ${singles.get(first.single) ?? first.single}`,
          first.word === first.single ? "" : `単複差で一致: ${first.word} と ${first.single}`,
          "この枠は絶対に言えないため追加効果がない。別の説明経路を塞ぐ語へ差し替える",
        ].filter((line) => line.length > 0));
      }
      continue;
    }
    const word = words[0];
    if (word === undefined) {
      continue;
    }
    for (const [other, otherEntry] of singles) {
      if (other === word || entries.findIndex((item) => item.entry === otherEntry) >= index) {
        continue;
      }
      if (sameStem(word, other)) {
        findings.error(13, card.id, "複数形の違いだけで重複している禁止語がある", [
          `枠: ${entry}`,
          `既存の枠: ${otherEntry}`,
        ]);
        break;
      }
    }
  }
}

/** 複数形の `s` / `es` だけを吸収して語幹を比べる。不規則変化は扱わない */
function sameStem(a: string, b: string): boolean {
  const stems = (word: string): Set<string> => {
    const out = new Set([word]);
    if (word.endsWith("es")) {
      out.add(word.slice(0, -2));
    }
    if (word.endsWith("s")) {
      out.add(word.slice(0, -1));
    }
    return out;
  };
  for (const stem of stems(a)) {
    if (stems(b).has(stem)) {
      return true;
    }
  }
  return false;
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

/**
 * 検証8: 正解がセット内で一意である。
 *
 * 一意性がidにしか課されていないと、同じお題を並べたセットが全項目を通る（実測）。
 * 2ラウンド目以降に場が既に当てたお題が再登場し、回答者は説明を聞かずに答えられる。
 */
function checkAnswerUnique(target: TabooSet, findings: Findings): void {
  const seen = new Map<string, string>();
  for (const card of target.cards) {
    const key = wordsOf(card.answer).join(" ");
    if (key.length === 0) {
      continue;
    }
    const first = seen.get(key);
    if (first !== undefined) {
      findings.error(8, card.id, "正解がセット内で重複している", [`正解: ${card.answer}`, `先に現れたカード: ${first}`]);
      continue;
    }
    seen.set(key, card.id);
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
    checkTabooShape(card, findings);
    checkTabooNotCompoundPart(card, findings);
    checkNoRedundantTaboo(card, findings);
    checkJapaneseName(card, findings);
    checkAliases(card, findings);
  }
  checkAnswerUnique(target, findings);

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
