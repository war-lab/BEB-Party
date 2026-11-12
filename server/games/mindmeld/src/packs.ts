// バンドルしたお題パックへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// お題パックの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { MindMeldPack, MindMeldPackSummary } from "@beb/shared-mindmeld";
import { packJsons } from "./packs.generated";

export const PACKS: MindMeldPack[] = packJsons as MindMeldPack[];

export function findPack(packId: string): MindMeldPack | undefined {
  return PACKS.find((entry) => entry.id === packId);
}

/** ロビーへ配る公開メタ情報。お題の一覧を含めない（15のカタログ） */
export function summarize(target: MindMeldPack): MindMeldPackSummary {
  return { id: target.id, title: target.title };
}
