// 事件データ検証のCLIエントリ。実装は validate/run.ts にある。
// ゲームを追加するときは validators に1行足す（05_ゲームモジュール.md「ゲームを追加する手順」）
import { fileURLToPath } from "node:url";
import { validateCase } from "@beb/server-detectives";
import { runValidation, type GameValidator } from "./validate/run";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const validators: GameValidator[] = [{ contentPath: "content/detectives", validate: validateCase }];

const result = runValidation(repoRoot, validators);
for (const line of result.lines) {
  if (line.startsWith("[ERROR]")) {
    console.error(line);
  } else {
    console.log(line);
  }
}
process.exit(result.exitCode);
