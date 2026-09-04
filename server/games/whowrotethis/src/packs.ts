// バンドルした質問パックへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// 質問データの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { WhoWroteThisPack, WhoWroteThisPackSummary } from "@beb/shared-whowrotethis";
import { packJsons } from "./packs.generated";

export const PACKS: WhoWroteThisPack[] = packJsons as WhoWroteThisPack[];

export function findPack(packId: string): WhoWroteThisPack | undefined {
  return PACKS.find((entry) => entry.id === packId);
}

/** ロビーへ配る公開メタ情報。質問文と言い回しを含めない（ADR-0003、11のカタログ） */
export function summarize(target: WhoWroteThisPack): WhoWroteThisPackSummary {
  return {
    id: target.id,
    title: target.title,
    questionCount: target.questions.length,
  };
}
