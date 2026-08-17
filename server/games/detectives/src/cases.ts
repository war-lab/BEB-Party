// バンドルした事件データへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// 事件データの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { Case, CaseSummary } from "@beb/shared-detectives";
import { caseJsons } from "./cases.generated";

export const CASES: Case[] = caseJsons as Case[];

export function findCase(caseId: string): Case | undefined {
  return CASES.find((entry) => entry.id === caseId);
}

/** ロビーへ配る公開メタ情報。facts・variants・revealを含めない（ADR-0003） */
export function summarize(target: Case): CaseSummary {
  return {
    id: target.id,
    title: target.title,
    playerCount: target.playerCount,
    briefingJa: target.briefing.ja,
  };
}
