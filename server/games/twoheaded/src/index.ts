// TWO-HEADED SPEAKERのゲームモジュール

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
