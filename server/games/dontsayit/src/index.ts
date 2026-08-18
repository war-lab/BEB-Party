// DON'T SAY ITのゲームモジュール
export { dontSayItModule, type DontSayItGameSecret } from "./module";
export { SETS, findSet, summarize } from "./sets";

// お題データの検証（CIのpnpm validate:contentから呼ぶ。ランタイムでは呼ばない）
export { parseSet, type ParseResult, type SchemaIssue } from "./set-schema";
export {
  formatFinding,
  validateContent,
  validateSet,
  type Finding,
  type ValidationItem,
  type ValidationReport,
} from "./validate-content";
