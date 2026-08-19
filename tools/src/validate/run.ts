// コンテンツ検証CLIの本体。ゲームごとのvalidateContentを呼び分ける（05_ゲームモジュール.md）。
//
// content/<gameId>/ の配下構造はゲームモジュールが決める。ここは走査してディレクトリ名を
// gameIdとして扱い、JSONを読み込んで検証結果を並べるだけとする。
//
// 反例の整形はゲームモジュール側が持つ。ここが特定のゲームのFinding型を知ると、
// ゲームを追加するたびに出力の欄を増やすことになり、CLIがゲームごとに分岐する（07の依存の向き）。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/** ゲーム非依存の検証結果。linesは整形済みで、1件の反例が複数行になることがある */
export interface GameReport {
  errorCount: number;
  warningCount: number;
  lines: string[];
}

export interface GameValidator {
  /** リポジトリルートからの相対パス（例: content/<gameId>） */
  contentPath: string;
  validate(content: unknown): GameReport;
}

export interface RunResult {
  exitCode: number;
  lines: string[];
}

/**
 * ゲームモジュールのValidationReportをCLIが扱う形へ寄せる。
 *
 * ゲームごとにFinding型と欄の数が違うため、整形関数を受け取る。
 */
export function toGameReport<TFinding>(
  report: { findings: TFinding[]; errorCount: number; warningCount: number },
  format: (finding: TFinding) => string,
): GameReport {
  return {
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    lines: report.findings.map((finding) => format(finding)),
  };
}

/**
 * ファイルパスからどのゲームの検証を使うか選ぶ。
 *
 * 単一ファイル検証でもゲームを取り違えないようにする。
 * ゲームが1本のうちは呼び出し側が固定で渡せたが、2本目からは判別が必要になる。
 */
export function selectValidator(validators: GameValidator[], filePath: string): GameValidator | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  return validators.find(
    (validator) => normalized.includes(`/${validator.contentPath}/`) || normalized.startsWith(`${validator.contentPath}/`),
  );
}

/**
 * 単一のJSONファイルだけを検証する。コンテンツを書いている途中の確認に使う。
 *
 * CIが見るのは `runValidation` の側であり、こちらは執筆時の補助に限る。
 */
export function runValidationOnFile(filePath: string, validators: GameValidator[]): RunResult {
  if (!existsSync(filePath)) {
    return { exitCode: 1, lines: [`[ERROR] ファイルが見つからない: ${filePath}`] };
  }
  const validator = selectValidator(validators, filePath);
  if (validator === undefined) {
    const paths = validators.map((entry) => entry.contentPath).join(" / ");
    return { exitCode: 1, lines: [`[ERROR] どのゲームのcontent配下でもない: ${filePath}（対象: ${paths}）`] };
  }

  let content: unknown;
  try {
    content = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    return { exitCode: 1, lines: [`[ERROR] ${filePath} をJSONとして読めない: ${String(error)}`] };
  }

  const report = validator.validate(content);
  const lines = [...report.lines];
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
      lines.push(...report.lines);
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
