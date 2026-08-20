// バンドルしたお題データへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// お題データの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { RankingPack, RankingPackSummary } from "@beb/shared-ranking";
import { packJsons } from "./packs.generated";

export const PACKS: RankingPack[] = packJsons as RankingPack[];

export function findPack(packId: string): RankingPack | undefined {
  return PACKS.find((entry) => entry.id === packId);
}

/** ロビーへ配る公開メタ情報。項目・目標・日本語文を含めない（ADR-0003） */
export function summarize(target: RankingPack): RankingPackSummary {
  return {
    id: target.id,
    title: target.title,
    setCount: target.sets.length,
  };
}
