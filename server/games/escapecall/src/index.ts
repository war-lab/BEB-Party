// ESCAPE CALLのゲームモジュール
export { escapeCallModule, type EscapeCallGameSecret, type LockSecret } from "./module";
export { PACKS, findPack, summarize } from "./packs";

// 舞台パックの検証（CIのpnpm validate:contentから呼ぶ。ランタイムでは呼ばない）
export { parsePack, type ParseResult, type SchemaIssue } from "./pack-schema";
export {
  formatFinding,
  validateContent,
  validatePack,
  type Finding,
  type ValidationItem,
  type ValidationReport,
} from "./validate-content";
