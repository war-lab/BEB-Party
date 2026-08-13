import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// M0時点ではDETECTIVESのcontent/がまだ存在しないため、ディレクトリ自体が無ければスキップする。
// ディレクトリがあって0件の場合はエラーとする（07_リポジトリとツールチェーン.md、04_事件データと検証.md）
const contentDir = fileURLToPath(new URL("../../content/detectives", import.meta.url));

if (!existsSync(contentDir)) {
  console.log("::notice::content/detectives が存在しないため検証をスキップする");
  process.exit(0);
}

const entries = readdirSync(contentDir);
if (entries.length === 0) {
  console.error("content/detectives が空である");
  process.exit(1);
}

// M1以降で実際の検証7項目を実装する
console.log(`content/detectives の ${entries.length}件を検証対象として検出した（検証ロジックはM1で実装）`);
