// SECRET TEAMSのゲームモジュール
export { secretTeamsModule, type SecretTeamsGameSecret, type TeamSecret } from "./module";
export { PACKS, findPack, summarize } from "./packs";

// テーマパックの検証（CIのpnpm validate:contentから呼ぶ。ランタイムでは呼ばない）
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
