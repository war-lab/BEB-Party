// BLIND ROOMのお題データ検証。検証13項目を実装する（基本設計/12_BLINDROOMゲームモジュール.md）。
//
// 判定は件数・一意性・文字種の計数だけで足りる。英文の意味を判定しない（不変条件1）。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import {
  MAX_ITEM_ID_LENGTH,
  MAX_ITEM_WORDS,
  MIN_DESCRIBER_HINTS,
  MIN_ITEMS,
  MIN_KEY_EXPRESSIONS,
  HINT_BLANK,
  countWords,
  hasHintBlank,
  isValidIconId,
  isValidItemId,
  type BlindRoomPack,
  type ItemSet,
} from "@beb/shared-blindroom";
import type { ValidationResult } from "@beb/shared-core";
import { parsePack } from "./pack-schema";

/** 検証項目。1〜13は12の検証項目、schemaは前提となる構造検証 */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | "schema";

export interface Finding {
  packId: string;
  /** アイテムセット単位の項目のみ。パック単位の項目はnull */
  itemSetId: string | null;
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

  error(item: ValidationItem, itemSetId: string | null, message: string, detail: string[] = []): void {
    this.items.push({ packId: this.packId, itemSetId, item, severity: "error", message, detail });
  }
}

/** 検証2: easyとstandardのアイテムセットが各1件以上ある。説明者のレベルで切り替えるため両方が要る */
function checkTierCoverage(pack: BlindRoomPack, findings: Findings): void {
  for (const tier of ["easy", "standard"] as const) {
    if (!pack.itemSets.some((set) => set.tier === tier)) {
      findings.error(2, null, `tierが${tier}のアイテムセットが必要である`);
    }
  }
}

/** 検証5: アイテムセットidがパック内で一意 */
function checkItemSetIdUnique(pack: BlindRoomPack, findings: Findings): void {
  const seen = new Set<string>();
  for (const set of pack.itemSets) {
    if (seen.has(set.id)) {
      findings.error(5, set.id, "アイテムセットのidが重複している");
    }
    seen.add(set.id);
  }
}

/** 検証4: itemIdがパック内で一意。セットをまたいで重複すると開示の表示が引けなくなる */
function checkItemIdUnique(pack: BlindRoomPack, findings: Findings): void {
  const owner = new Map<string, string>();
  for (const set of pack.itemSets) {
    for (const item of set.items) {
      const previous = owner.get(item.id);
      if (previous !== undefined) {
        findings.error(4, set.id, "itemIdが重複している", [`id: ${item.id}`, `既出: ${previous}`]);
      }
      owner.set(item.id, set.id);
    }
  }
}

/** 検証3: 1セットのアイテム数の下限。配置5個に対して選ばれない候補が3件以上残るようにする */
function checkItemCount(set: ItemSet, findings: Findings): void {
  if (set.items.length < MIN_ITEMS) {
    findings.error(3, set.id, `アイテムは${MIN_ITEMS}件以上である必要がある`, [`実際: ${set.items.length}件`]);
  }
}

/** 検証6: itemIdの文字種と長さ。placeのペイロードが ACTION_MAX_CHARS に収まることを保つ */
function checkItemIdFormat(set: ItemSet, findings: Findings): void {
  for (const item of set.items) {
    if (!isValidItemId(item.id)) {
      findings.error(6, set.id, `itemIdは小文字英数字とアンダースコアの${MAX_ITEM_ID_LENGTH}文字以内である必要がある`, [
        `id: ${item.id}`,
      ]);
    }
  }
}

/** 検証7: アイコンidがファイル名として使える形である（12のコンテンツ形式、ADR-0025） */
function checkIconFormat(set: ItemSet, findings: Findings): void {
  for (const item of set.items) {
    if (!isValidIconId(item.icon)) {
      findings.error(7, set.id, `iconは小文字英数字とアンダースコアの${MAX_ITEM_ID_LENGTH}文字以内である必要がある`, [
        `id: ${item.id}`,
        `icon: ${item.icon}`,
      ]);
    }
  }
}

/**
 * 検証8: 同一セット内でiconが重複しない。
 *
 * 見た目が同じアイテムが2件あると盤面の上で区別できず、正しく聞き取った聞き手が採点で落ちる。
 */
function checkIconUnique(set: ItemSet, findings: Findings): void {
  const seen = new Map<string, string>();
  for (const item of set.items) {
    const previous = seen.get(item.icon);
    if (previous !== undefined) {
      findings.error(8, set.id, "同じiconのアイテムが2件ある", [`${previous} と ${item.id}`, `icon: ${item.icon}`]);
    }
    seen.set(item.icon, item.id);
  }
}

/** 検証9: 同一セット内でenが重複せず、1〜3語である。マスとパレットに収まる長さに限る */
function checkItemName(set: ItemSet, findings: Findings): void {
  const seen = new Map<string, string>();
  for (const item of set.items) {
    const key = item.en.trim().toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      findings.error(9, set.id, "同じenのアイテムが2件ある", [`${previous} と ${item.id}`, `en: ${item.en}`]);
    }
    seen.set(key, item.id);

    const words = countWords(item.en);
    if (words < 1 || words > MAX_ITEM_WORDS) {
      findings.error(9, set.id, `enは1〜${MAX_ITEM_WORDS}語である必要がある`, [`${words}語: ${item.en}`]);
    }
  }
}

/** 検証10: describerHintsの下限。レベル1〜2へ4件渡す設計に合わせる */
function checkHintCount(set: ItemSet, findings: Findings): void {
  if (set.describerHints.length < MIN_DESCRIBER_HINTS) {
    findings.error(10, set.id, `describerHintsは${MIN_DESCRIBER_HINTS}件以上である必要がある`, [
      `実際: ${set.describerHints.length}件`,
    ]);
  }
}

/**
 * 検証11: describerHintsが空欄を含む（完成文になっていない）。
 *
 * 枠にアイテム名を入れて初めて文になるため、枠であることが説明の組み立てを促す（12の秘密情報）。
 */
function checkHintBlank(set: ItemSet, findings: Findings): void {
  for (const hint of set.describerHints) {
    if (!hasHintBlank(hint)) {
      findings.error(11, set.id, `describerHintsは空欄（${HINT_BLANK}）を含む必要がある`, [`完成文: ${hint}`]);
    }
  }
}

/** 検証13: すべてのjaが空でない。フォントサブセットの入力になる（基本設計/07） */
function checkJapanese(pack: BlindRoomPack, findings: Findings): void {
  for (const expression of pack.keyExpressions) {
    if (expression.ja.trim() === "") {
      findings.error(13, null, "keyExpressionsのjaが空白のみである", [`en: ${expression.en}`]);
    }
  }
  for (const set of pack.itemSets) {
    for (const item of set.items) {
      if (item.ja.trim() === "") {
        findings.error(13, set.id, "アイテムのjaが空白のみである", [`id: ${item.id}`]);
      }
    }
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

  checkTierCoverage(pack, findings);
  checkItemSetIdUnique(pack, findings);
  checkItemIdUnique(pack, findings);

  // 検証12: keyExpressionsの下限。聞き手の質問に使う言い回しはパック直下に持つ
  if (pack.keyExpressions.length < MIN_KEY_EXPRESSIONS) {
    findings.error(12, null, `keyExpressionsは${MIN_KEY_EXPRESSIONS}件以上である必要がある`, [
      `実際: ${pack.keyExpressions.length}件`,
    ]);
  }

  for (const set of pack.itemSets) {
    checkItemCount(set, findings);
    checkItemIdFormat(set, findings);
    checkIconFormat(set, findings);
    checkIconUnique(set, findings);
    checkItemName(set, findings);
    checkHintCount(set, findings);
    checkHintBlank(set, findings);
  }

  checkJapanese(pack, findings);

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

/** 反例の1件を1〜複数行へ整形する。欄は「パックid / アイテムセットid / 検証項目」の3点 */
export function formatFinding(finding: Finding): string {
  const item = typeof finding.item === "number" ? `検証${finding.item}` : finding.item;
  const set = finding.itemSetId ?? "パック全体";
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
