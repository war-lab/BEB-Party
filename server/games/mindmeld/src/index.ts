// MIND MELDのゲームモジュール
export { mindMeldModule, type MindMeldGameSecret } from "./module";
export { PACKS, findPack, summarize } from "./packs";

// お題パックの検証（CIのpnpm validate:contentから呼ぶ。ランタイムでは呼ばない）
export { parsePack, type ParseResult, type SchemaIssue } from "./pack-schema";
export {
  THRESHOLDS,
  formatFinding,
  validateContent,
  validatePack,
  type Finding,
  type ValidationItem,
  type ValidationReport,
} from "./validate-content";
