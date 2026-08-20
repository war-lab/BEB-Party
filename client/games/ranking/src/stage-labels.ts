// ステージの表示文言。ゲーム内のタイマーバーと、共通コアのホスト画面が同じ文言を使う（基本設計/02）。
// 文言の正本は shared/games/ranking の STAGE_LABELS_JA にあり、ここは共通コアへ渡す形へ包むだけとする
import { STAGE_LABELS_JA } from "@beb/shared-ranking";

export const stageLabels = STAGE_LABELS_JA;

// 共通コアはステージを不透明な文字列としてしか知らないため、既定エクスポートは緩い型で渡す
export default stageLabels as Record<string, string>;
