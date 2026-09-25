// バンドルした舞台パックへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// 舞台パックの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { EscapeCallPack, EscapeCallPackSummary } from "@beb/shared-escapecall";
import { packJsons } from "./packs.generated";

export const PACKS: EscapeCallPack[] = packJsons as EscapeCallPack[];

export function findPack(packId: string): EscapeCallPack | undefined {
  return PACKS.find((entry) => entry.id === packId);
}

/** ロビーへ配る公開メタ情報。規則の言い回しを含めない（ADR-0003、13のカタログ） */
export function summarize(target: EscapeCallPack): EscapeCallPackSummary {
  return { id: target.id, title: target.title };
}
