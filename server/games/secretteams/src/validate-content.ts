// SECRET TEAMSのテーマパック検証。検証10項目を実装する（基本設計/17_SECRETTEAMSゲームモジュール.md の検証項目）。
//
// 判定は件数・文字の種類・表記の一致だけで足りる。語の意味の近さは判定しない（不変条件1）。
// 単語がテーマに属すると読めるか、近いテーマが紛らわしいかは、人手のレビューで見る（17の「機械で検査しないもの」）。
// このコードはCI（tools）からのみ呼ぶ。ランタイムのコードパスには置かない（基本設計/05）。
import type { ValidationResult } from "@beb/shared-core";
import { NEAR_THEMES_PER_FAMILY, TEAM_SIZES, type SecretTeamsPack } from "@beb/shared-secretteams";
import { parsePack } from "./pack-schema";

/** 1チームの最大人数。TEAM_SIZES の表から求める */
const MAX_TEAM_SIZE = Math.max(...Object.values(TEAM_SIZES).flatMap((sizes) => [...sizes]));

/** 検証の閾値（17の検証項目） */
export const THRESHOLDS = {
  /** 系統の件数の下限。2チームのテーマを別の系統から選ぶ（検証3） */
  minFamilies: 2,
  /** 各系統のテーマの件数の下限。本物のテーマ1件と近いテーマ2件（検証3） */
  minThemesPerFamily: 1 + NEAR_THEMES_PER_FAMILY,
  /** 各テーマの単語の件数の下限。1チームの最大人数に2件の余裕を足す（検証4） */
  minWordsPerTheme: MAX_TEAM_SIZE + 2,
  /** 単語の en の文字数の上限（検証5） */
  wordMaxChars: 20,
  /** keyExpressions の下限（検証9） */
  minKeyExpressions: 5,
} as const;

/** 検証項目。17の検証項目の番号。1は構造検証（pack-schema.ts） */
export type ValidationItem = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Finding {
  packId: string;
  /** 系統・テーマ単位の項目のみ。パック単位の項目はnull */
  targetId: string | null;
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

  error(item: ValidationItem, targetId: string | null, message: string, detail: string[] = []): void {
    this.items.push({ packId: this.packId, targetId, item, severity: "error", message, detail });
  }
}

const ID_PATTERN = /^[a-z0-9_]{1,16}$/u;

/** 単語の en。英小文字の語を半角空白かハイフンでつないだもの（17の検証5） */
const WORD_EN_PATTERN = /^[a-z]+([ -][a-z]+)*$/u;

function allThemes(pack: SecretTeamsPack) {
  return pack.families.flatMap((family) => family.themes);
}

function checkIds(pack: SecretTeamsPack, findings: Findings): void {
  if (!ID_PATTERN.test(pack.id)) {
    findings.error(2, null, "パックのidは [a-z0-9_] の1〜16文字である必要がある", [`id: ${pack.id}`]);
  }
  const families = new Set<string>();
  for (const family of pack.families) {
    if (!ID_PATTERN.test(family.id)) {
      findings.error(2, family.id, "系統のidは [a-z0-9_] の1〜16文字である必要がある");
    }
    if (families.has(family.id)) {
      findings.error(2, family.id, "系統のidが重複している");
    }
    families.add(family.id);
  }
  const themes = new Set<string>();
  for (const theme of allThemes(pack)) {
    if (!ID_PATTERN.test(theme.id)) {
      findings.error(2, theme.id, "テーマのidは [a-z0-9_] の1〜16文字である必要がある");
    }
    if (themes.has(theme.id)) {
      findings.error(2, theme.id, "テーマのidが重複している");
    }
    themes.add(theme.id);
  }
}

function checkCounts(pack: SecretTeamsPack, findings: Findings): void {
  if (pack.families.length < THRESHOLDS.minFamilies) {
    findings.error(3, null, `系統は${THRESHOLDS.minFamilies}件以上である必要がある`, [`実際: ${pack.families.length}件`]);
  }
  for (const family of pack.families) {
    if (family.themes.length < THRESHOLDS.minThemesPerFamily) {
      findings.error(3, family.id, `系統のテーマは${THRESHOLDS.minThemesPerFamily}件以上である必要がある`, [
        `実際: ${family.themes.length}件`,
      ]);
    }
  }
  for (const theme of allThemes(pack)) {
    if (theme.words.length < THRESHOLDS.minWordsPerTheme) {
      findings.error(4, theme.id, `テーマの単語は${THRESHOLDS.minWordsPerTheme}件以上である必要がある`, [
        `実際: ${theme.words.length}件`,
      ]);
    }
  }
}

function checkWordText(pack: SecretTeamsPack, findings: Findings): void {
  for (const theme of allThemes(pack)) {
    for (const word of theme.words) {
      if (!WORD_EN_PATTERN.test(word.en)) {
        findings.error(5, theme.id, "単語のenは英小文字の語を半角空白かハイフンでつないだものである必要がある", [
          `en: ${word.en}`,
        ]);
      }
      if ([...word.en].length > THRESHOLDS.wordMaxChars) {
        findings.error(5, theme.id, `単語のenは${THRESHOLDS.wordMaxChars}文字以内である必要がある`, [`en: ${word.en}`]);
      }
    }
  }
}

/** 単語の en がパック全体で重複しない。系統をまたぐ重複も、系統の中の重複も落とす（17の検証6） */
function checkWordDuplicates(pack: SecretTeamsPack, findings: Findings): void {
  const owners = new Map<string, string>();
  for (const theme of allThemes(pack)) {
    for (const word of theme.words) {
      const owner = owners.get(word.en);
      if (owner !== undefined) {
        findings.error(6, theme.id, "単語のenがパック内で重複している", [`en: ${word.en}`, `先のテーマ: ${owner}`]);
      } else {
        owners.set(word.en, theme.id);
      }
    }
  }
}

/** 単語を空白とハイフンで区切った各語が、どのテーマの en（小文字に揃えたもの）とも一致しない（17の検証7） */
function checkWordContainsTheme(pack: SecretTeamsPack, findings: Findings): void {
  const themeNames = new Map(allThemes(pack).map((theme) => [theme.en.toLowerCase(), theme.id]));
  for (const theme of allThemes(pack)) {
    for (const word of theme.words) {
      for (const part of word.en.split(/[ -]/u)) {
        const named = themeNames.get(part);
        if (named !== undefined) {
          findings.error(7, theme.id, "単語の中にテーマ名がそのまま入っている", [`en: ${word.en}`, `テーマ: ${named}`]);
        }
      }
    }
  }
}

/** テーマの en が小文字に揃えてパック内で一意（17の検証8） */
function checkThemeNames(pack: SecretTeamsPack, findings: Findings): void {
  const owners = new Map<string, string>();
  for (const theme of allThemes(pack)) {
    const key = theme.en.toLowerCase();
    const owner = owners.get(key);
    if (owner !== undefined) {
      findings.error(8, theme.id, "テーマのenが小文字に揃えて重複している", [`en: ${theme.en}`, `先のテーマ: ${owner}`]);
    } else {
      owners.set(key, theme.id);
    }
  }
}

function checkKeyExpressions(pack: SecretTeamsPack, findings: Findings): void {
  if (pack.keyExpressions.length < THRESHOLDS.minKeyExpressions) {
    findings.error(9, null, `keyExpressionsは${THRESHOLDS.minKeyExpressions}件以上である必要がある`, [
      `実際: ${pack.keyExpressions.length}件`,
    ]);
  }
}

/**
 * すべての ja が空でない（17の検証10）。
 *
 * ja はフォントサブセットの入力になる（基本設計/07）。空文字の欄は構造検証（検証1）で落ちるため、ここは空白のみの欄を見る。
 */
function checkJapanese(pack: SecretTeamsPack, findings: Findings): void {
  if (pack.title.trim() === "") {
    findings.error(10, null, "titleが空白のみである");
  }
  for (const [index, entry] of pack.keyExpressions.entries()) {
    if (entry.ja.trim() === "") {
      findings.error(10, null, "keyExpressionsのjaが空白のみである", [`keyExpressions[${index}]`]);
    }
  }
  for (const theme of allThemes(pack)) {
    if (theme.ja.trim() === "") {
      findings.error(10, theme.id, "テーマのjaが空白のみである");
    }
    for (const word of theme.words) {
      if (word.ja.trim() === "") {
        findings.error(10, theme.id, "単語のjaが空白のみである", [`en: ${word.en}`]);
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
      findings.error(1, null, `${issue.path}: ${issue.message}`);
    }
    return report(packId, findings.items);
  }

  const pack = parsed.value;
  const findings = new Findings(pack.id);
  checkIds(pack, findings);
  checkCounts(pack, findings);
  checkWordText(pack, findings);
  checkWordDuplicates(pack, findings);
  checkWordContainsTheme(pack, findings);
  checkThemeNames(pack, findings);
  checkKeyExpressions(pack, findings);
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

/** 反例の1件を1〜複数行へ整形する。欄は「パックid / 系統・テーマid / 検証項目」の3点 */
export function formatFinding(finding: Finding): string {
  const target = finding.targetId ?? "パック全体";
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
