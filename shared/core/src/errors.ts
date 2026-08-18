// エラーコードの正本は基本設計/01_サーバ.md のエラーコード表とする

export const ERROR_CODES = {
  ROOM_NOT_FOUND: "room_not_found",
  ROOM_FULL: "room_full",
  SPECTATOR_LIMIT: "spectator_limit",
  GAME_IN_PROGRESS: "game_in_progress",
  NOT_HOST: "not_host",
  INVALID_LIFECYCLE: "invalid_lifecycle",
  INVALID_PAYLOAD: "invalid_payload",
  UNKNOWN_GAME: "unknown_game",
  PLAYER_COUNT_MISMATCH: "player_count_mismatch",
  UNSUPPORTED_VERSION: "unsupported_version",
  RATE_LIMITED: "rate_limited",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
