// 汎用前方推論エンジン。特定のゲームの語彙を持ち込まない（ADR-0009、基本設計/06）
export { EngineError, type Rule, type Saturation } from "./types";
export { explain, isRequired, saturate, type Derivation } from "./saturate";
