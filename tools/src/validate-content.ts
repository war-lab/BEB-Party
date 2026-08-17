// 事件データ検証のCLIエントリ。実装は validate/run.ts にある。
// ゲームを追加するときは validators に1行足す（05_ゲームモジュール.md「ゲームを追加する手順」）
//
// 引数にファイルパスを渡すと、そのファイルだけを検証する（執筆時の確認用）。
// 引数なしのときが本番の挙動であり、CIはこちらを使う。
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCase } from "@beb/server-detectives";
import { runValidation, runValidationOnFile, type GameValidator } from "./validate/run";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const validators: GameValidator[] = [{ contentPath: "content/detectives", validate: validateCase }];

const target = process.argv[2];
const result = target
  ? runValidationOnFile(resolve(process.cwd(), target), validateCase)
  : runValidation(repoRoot, validators);

for (const line of result.lines) {
  if (line.startsWith("[ERROR]")) {
    console.error(line);
  } else {
    console.log(line);
  }
}
process.exit(result.exitCode);
