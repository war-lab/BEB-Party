// バンドルしたお題パックへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// お題データの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { BlindRoomPack, BlindRoomPackSummary } from "@beb/shared-blindroom";
import { packJsons } from "./packs.generated";

export const PACKS: BlindRoomPack[] = packJsons as BlindRoomPack[];

export function findPack(packId: string): BlindRoomPack | undefined {
  return PACKS.find((entry) => entry.id === packId);
}

/** ロビーへ配る公開メタ情報。アイテムと言い回しを含めない（ADR-0003、12のカタログ） */
export function summarize(target: BlindRoomPack): BlindRoomPackSummary {
  return {
    id: target.id,
    title: target.title,
    itemSetCount: target.itemSets.length,
  };
}
