// SECRET RULE ENGLISHのゲームモジュール
export { secretRuleModule, type SecretRuleGameSecret } from "./module";
export { PACKS, findPack, summarize } from "./packs";

// 規則パックの検証（CIのpnpm validate:contentから呼ぶ。ランタイムでは呼ばない）
export { parsePack, type ParseResult, type SchemaIssue } from "./pack-schema";
export {
  THRESHOLDS,
  formatFinding,
  measurePack,
  validateContent,
  validatePack,
  type Finding,
  type PackMeasurement,
  type ValidationItem,
  type ValidationReport,
} from "./validate-content";
