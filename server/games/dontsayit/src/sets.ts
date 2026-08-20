// バンドルしたお題データへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// お題データの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { DontSayItSetSummary, TabooSet } from "@beb/shared-dontsayit";
import { setJsons } from "./sets.generated";

export const SETS: TabooSet[] = setJsons as TabooSet[];

export function findSet(setId: string): TabooSet | undefined {
  return SETS.find((entry) => entry.id === setId);
}

/** ロビーへ配る公開メタ情報。cards・constraints・keyExpressionsを含めない（ADR-0003） */
export function summarize(target: TabooSet): DontSayItSetSummary {
  return {
    id: target.id,
    title: target.title,
    cardCount: target.cards.length,
  };
}
