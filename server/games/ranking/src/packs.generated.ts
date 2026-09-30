// 自動生成ファイル。手で編集しない。
// scripts/generate-pack-index.mjs が content/ranking/ を走査して生成する。

import gear from "../../../../content/ranking/gear.json";
import homeLife from "../../../../content/ranking/home-life.json";
import values from "../../../../content/ranking/values.json";

// お題データの生JSON。型付けは sets.ts で行う
export const packJsons: unknown[] = [
  gear,
  homeLife,
  values,
];
