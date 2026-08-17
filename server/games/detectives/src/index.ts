// DETECTIVESのゲームモジュール
export { detectivesModule, type DetectivesGameSecret } from "./module";
export { CASES, findCase, summarize } from "./cases";

// 事件データの検証（CIのpnpm validate:contentから呼ぶ。ランタイムでは呼ばない）
export { parseCase, type ParseResult, type SchemaIssue } from "./case-schema";
export { derive5p, has5p, mergedAwayIds } from "./derive-5p";
export {
  formatFinding,
  validateCase,
  validateContent,
  type Finding,
  type ValidationItem,
  type ValidationReport,
} from "./validate-content";
