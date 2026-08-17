// バンドルした事件データへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// 事件データの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import { RANDOM_CASE_ID, type Case, type CaseSummary } from "@beb/shared-detectives";
import { caseJsons } from "./cases.generated";

export const CASES: Case[] = caseJsons as Case[];

export function findCase(caseId: string): Case | undefined {
  return CASES.find((entry) => entry.id === caseId);
}

/** 「おまかせ」のカタログ表示。実際の抽選は start で行う */
export const RANDOM_CASE_SUMMARY: CaseSummary = {
  id: RANDOM_CASE_ID,
  title: "おまかせ（ランダム）",
  playerCount: [5, 6],
  briefingJa: "収録されている事件から1つをその場で選ぶ。開始するまで誰も事件を知らない。",
};

/** ロビーへ配る公開メタ情報。facts・variants・revealを含めない（ADR-0003） */
export function summarize(target: Case): CaseSummary {
  return {
    id: target.id,
    title: target.title,
    playerCount: target.playerCount,
    briefingJa: target.briefing.ja,
  };
}
