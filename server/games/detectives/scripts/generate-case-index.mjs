// content/detectives/ を走査して src/cases.generated.ts を生成する。
//
// 事件の一覧は手動の目次ファイルを持たない（基本設計/04_事件データと検証.md）。
// 一方でWorkerのバンドルにはimportで取り込む必要がある（基本設計/01のコンテンツの読み込み）。
// この2つを両立させるため、走査結果をimport文へ落としたファイルを生成してコミットする。
// 再生成忘れはCIの差分チェックで検出する。
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const rootDir = path.join(packageDir, "..", "..", "..");
const contentDir = path.join(rootDir, "content", "detectives");
const outputPath = path.join(packageDir, "src", "cases.generated.ts");

// 走査順をOSに依存させない（生成物のバイト列を安定させる）
const files = readdirSync(contentDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

function identifierOf(fileName) {
  const slug = fileName.replace(/\.json$/, "");
  return slug.replace(/[-_](.)/g, (_, c) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
}

const imports = files.map((file) => `import ${identifierOf(file)} from "../../../../content/detectives/${file}";`);
const entries = files.map((file) => `  ${identifierOf(file)},`);

const content = [
  "// 自動生成ファイル。手で編集しない。",
  "// scripts/generate-case-index.mjs が content/detectives/ を走査して生成する。",
  "",
  ...imports,
  "",
  "// 事件データの生JSON。型付けと検証は cases.ts で行う",
  "export const caseJsons: unknown[] = [",
  ...entries,
  "];",
  "",
].join("\n");

writeFileSync(outputPath, content, "utf8");
console.log(`generated ${outputPath} (${files.length} cases)`);
