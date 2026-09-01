// お題データのスキーマ型（正本）とWHO WROTE THIS?のランタイム型・表示文言の定数
export type { KeyExpression, Question, WhoWroteThisPack } from "./pack";
export { MIN_HINTS, MIN_KEY_EXPRESSIONS, MIN_QUESTIONS } from "./pack";

export {
  MAX_CHARS,
  MIN_WORDS,
  countChars,
  countWords,
  isSubmittable,
  normalizeSubmission,
} from "./text";

export {
  ACTIONS,
  ERROR_CODES,
  POINTS_PER_CORRECT_GUESS,
  POINTS_PER_HIDDEN,
  ROUNDS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  STAGE_LABELS_JA,
  WRITING_SECONDS,
  hintCountFor,
  isFinalRound,
  pointsOf,
  type ActionName,
  type ErrorCode,
  type GuessPayload,
  type GuessRecord,
  type PresentedItem,
  type RevealedItem,
  type RoundRecord,
  type ScoreEntry,
  type Stage,
  type SubmitPayload,
  type WhoWroteThisPackSummary,
  type WhoWroteThisPublic,
  type WhoWroteThisResult,
  type WhoWroteThisSecret,
  type WhoWroteThisSettings,
} from "./game";
