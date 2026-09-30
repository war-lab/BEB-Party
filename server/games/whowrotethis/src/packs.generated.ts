// 自動生成ファイル。手で編集しない。
// scripts/generate-pack-index.mjs が content/whowrotethis/ を走査して生成する。

import daily from "../../../../content/whowrotethis/daily.json";
import memories from "../../../../content/whowrotethis/memories.json";
import whatIf from "../../../../content/whowrotethis/what-if.json";

// 質問パックの生JSON。型付けは packs.ts で行う
export const packJsons: unknown[] = [
  daily,
  memories,
  whatIf,
];
