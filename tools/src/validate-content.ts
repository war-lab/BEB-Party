// コンテンツ検証のCLIエントリ。実装は validate/run.ts にある。
// ゲームを追加するときは validators に1行足す（05_ゲームモジュール.md「ゲームを追加する手順」）
//
// 引数にファイルパスを渡すと、そのファイルだけを検証する（執筆時の確認用）。
// 引数なしのときが本番の挙動であり、CIはこちらを使う。
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatFinding as formatCaseFinding, validateCase } from "@beb/server-detectives";
import { formatFinding as formatSetFinding, validateSet } from "@beb/server-dontsayit";
import { formatFinding as formatPackFinding, validatePack } from "@beb/server-ranking";
import {
  formatFinding as formatQuestionFinding,
  validatePack as validateQuestionPack,
} from "@beb/server-whowrotethis";
import { runValidation, runValidationOnFile, toGameReport, type GameValidator } from "./validate/run";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// 反例の欄はゲームごとに違うため、整形関数もゲーム側から渡す（run.tsはFinding型を知らない）
const validators: GameValidator[] = [
  {
    contentPath: "content/detectives",
    validate: (content) => toGameReport(validateCase(content), formatCaseFinding),
  },
  {
    contentPath: "content/dontsayit",
    validate: (content) => toGameReport(validateSet(content), formatSetFinding),
  },
  {
    contentPath: "content/ranking",
    validate: (content) => toGameReport(validatePack(content), formatPackFinding),
  },
  {
    contentPath: "content/whowrotethis",
    validate: (content) => toGameReport(validateQuestionPack(content), formatQuestionFinding),
  },
];

/**
 * 引数のパスを解決する。
 *
 * pnpmのフィルタ実行ではcwdがtoolsパッケージになるため、cwd基準だけだと
 * リポジトリ相対のパス（content/detectives/xxx.json）が見つからない。cwd → リポジトリルートの順に探す。
 */
function resolveTarget(target: string): string {
  if (isAbsolute(target)) {
    return target;
  }
  const fromCwd = resolve(process.cwd(), target);
  return existsSync(fromCwd) ? fromCwd : resolve(repoRoot, target);
}

const target = process.argv[2];
const result = target ? runValidationOnFile(resolveTarget(target), validators) : runValidation(repoRoot, validators);

for (const line of result.lines) {
  if (line.startsWith("[ERROR]")) {
    console.error(line);
  } else {
    console.log(line);
  }
}
process.exit(result.exitCode);
