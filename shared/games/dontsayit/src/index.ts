// お題データのスキーマ型（正本）とDON'T SAY ITのランタイム型・表示文言の定数
export type { Card, ConstraintCard, KeyExpression, TabooSet } from "./set";
export { ALIASES_MAX, MIN_CARDS, TABOO_PER_CARD } from "./set";

export {
  ACTIONS,
  ANSWERER_PROMPTS,
  CONSTRAINT_MIN_LEVEL,
  ERROR_CODES,
  MAX_CARD_ADVANCES_PER_ROUND,
  ROUND_SECONDS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  TABOO_COUNT,
  advancesOf,
  hasConstraint,
  pointsOf,
  roleOf,
  speakerPlayerIdOf,
  tabooCountFor,
  watcherPlayerIdOf,
  type ActionName,
  type AnswererSecret,
  type CardActionPayload,
  type ClaimCorrectPayload,
  type DontSayItPublic,
  type DontSayItResult,
  type DontSayItSecret,
  type DontSayItSettings,
  type DontSayItSetSummary,
  type ErrorCode,
  type Role,
  type RoundSummary,
  type ScoreEntry,
  type SpeakerSecret,
  type Stage,
  type WatcherSecret,
} from "./game";

// 旧版で保存された payload を現行の形へ補う。再接続では保存済みがそのまま返る
export { normalizeResult, normalizeSecret } from "./legacy-payload";
