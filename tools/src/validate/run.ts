// 事件データ検証CLIの本体。ゲームごとのvalidateContentを呼び分ける（05_ゲームモジュール.md）。
//
// content/<gameId>/ の配下構造はゲームモジュールが決める。ここは走査してディレクトリ名を
// gameIdとして扱い、JSONを読み込んで検証結果を整形するだけとする。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { formatFinding, type ValidationReport } from "@beb/server-detectives";

export interface GameValidator {
  /** リポジトリルートからの相対パス（例: content/<gameId>） */
  contentPath: string;
  validate(content: unknown): ValidationReport;
}

export interface RunResult {
  exitCode: number;
  lines: string[];
}

/**
 * 単一のJSONファイルだけを検証する。事件を書いている途中の確認に使う。
 *
 * CIが見るのは `runValidation` の側であり、こちらは執筆時の補助に限る。
 */
export function runValidationOnFile(filePath: string, validate: GameValidator["validate"]): RunResult {
  if (!existsSync(filePath)) {
    return { exitCode: 1, lines: [`[ERROR] ファイルが見つからない: ${filePath}`] };
  }
  let content: unknown;
  try {
    content = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    return { exitCode: 1, lines: [`[ERROR] ${filePath} をJSONとして読めない: ${String(error)}`] };
  }

  const report = validate(content);
  const lines = report.findings.map((finding) => formatFinding(finding));
  const name = basename(filePath);
  if (report.errorCount > 0) {
    lines.push(`[ERROR] ${name}: ${report.errorCount}件のエラー、${report.warningCount}件の警告`);
    return { exitCode: 1, lines };
  }
  lines.push(`[PASS] ${name}: ${report.warningCount}件の警告`);
  return { exitCode: 0, lines };
}

/** ゲームごとに content ディレクトリを走査して検証する */
export function runValidation(repoRoot: string, validators: GameValidator[]): RunResult {
  const lines: string[] = [];
  let failed = false;

  for (const validator of validators) {
    const gameId = basename(validator.contentPath);
    const directory = join(repoRoot, validator.contentPath);

    // ディレクトリ自体が無い場合はスキップする。作った時点で検証対象になる（04）
    if (!existsSync(directory)) {
      lines.push(`::notice::${validator.contentPath} が存在しないため検証をスキップする`);
      continue;
    }

    const files = readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .sort();

    // 対象0件をPASSにすると、検証が空回りしていることに気付けない（04）
    if (files.length === 0) {
      lines.push(`[ERROR] ${validator.contentPath} に検証対象のJSONが1件もない`);
      failed = true;
      continue;
    }

    for (const file of files) {
      const path = join(directory, file);
      let content: unknown;
      try {
        content = JSON.parse(readFileSync(path, "utf8"));
      } catch (error) {
        lines.push(`[ERROR] ${validator.contentPath}/${file} をJSONとして読めない: ${String(error)}`);
        failed = true;
        continue;
      }

      const report = validator.validate(content);
      for (const finding of report.findings) {
        lines.push(formatFinding(finding));
      }
      if (report.errorCount > 0) {
        failed = true;
        lines.push(`[ERROR] ${gameId}/${file}: ${report.errorCount}件のエラー、${report.warningCount}件の警告`);
      } else {
        lines.push(`[PASS] ${gameId}/${file}: ${report.warningCount}件の警告`);
      }
    }
  }

  return { exitCode: failed ? 1 : 0, lines };
}
