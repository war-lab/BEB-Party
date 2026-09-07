// 自動生成ファイル。手で編集しない。
// scripts/generate-set-index.mjs が content/dontsayit/ を走査して生成する。

import everydayThings from "../../../../content/dontsayit/everyday-things.json";
import famousFigures from "../../../../content/dontsayit/famous-figures.json";
import places from "../../../../content/dontsayit/places.json";

// お題データの生JSON。型付けは sets.ts で行う
export const setJsons: unknown[] = [
  everydayThings,
  famousFigures,
  places,
];
