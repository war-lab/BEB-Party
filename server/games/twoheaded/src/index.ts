// TWO-HEADED SPEAKERのゲームモジュール
export { twoHeadedModule, type TwoHeadedGameSecret, type UsedCard } from "./module";
export { SETS, findSet, summarize } from "./sets";

// お題セットの検証（CIのpnpm validate:contentから呼ぶ。ランタイムでは呼ばない）
export { parseSet, type ParseResult, type SchemaIssue } from "./set-schema";
export {
  THRESHOLDS,
  formatFinding,
  normalizeAnswer,
  validateContent,
  validateSet,
  type Finding,
  type ValidationItem,
  type ValidationReport,
} from "./validate-content";
