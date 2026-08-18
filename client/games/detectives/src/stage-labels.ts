// ステージの表示文言。捜査画面のタイマーバーと、共通コアのホスト画面が同じ文言を使う（基本設計/02）。
// 共通コアはこのテーブルをclient/app経由で受け取る。ゲームIDでの分岐は行わない（ADR-0009）
import { STAGES, type Stage } from "@beb/shared-detectives";

export const stageLabels: Record<Stage, string> = {
  [STAGES.briefing]: "ブリーフィング",
  [STAGES.investigation]: "捜査フェーズ",
  [STAGES.voting]: "投票フェーズ",
  [STAGES.reveal]: "開示",
};

// 共通コアはステージを不透明な文字列としてしか知らないため、既定エクスポートは緩い型で渡す
export default stageLabels as Record<string, string>;
