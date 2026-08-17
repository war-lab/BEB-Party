// DETECTIVESのゲームモジュール。M1では事件データの検証だけを提供する（GameModule実装はM2）
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
