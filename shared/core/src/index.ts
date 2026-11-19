export type {
  ContentSummary,
  GameSummary,
  Level,
  NumberSettingField,
  PinnedPair,
  Player,
  Room,
  SelectSettingField,
  SettingField,
} from "./types";
export * from "./errors";
// 遊び方の形のタグ。ロビーのゲーム一覧に出す（基本設計/05）
export {
  FORMAT_TAGS,
  GAME_TAG_LABELS,
  TRAIT_TAGS,
  isFormatTag,
  sortGameTags,
  type FormatTag,
  type GameTag,
  type TraitTag,
} from "./game-tags";
// プレイヤーアイコン。プロトコルに載るのはIDのみで、絵文字は表示用の対応表（ADR-0022）
export {
  PLAYER_ICONS,
  fallbackPlayerIconId,
  isPlayerIconId,
  playerIconEmoji,
  type PlayerIconDefinition,
  type PlayerIconId,
} from "./player-icon";
// シード付き乱数。ゲームモジュールが共通コアから注入されたseedで使う（基本設計/05）
export { createRandom, shuffle } from "./rng";
// チーム編成。自己申告レベルで偏りを抑えて抽選する（ADR-0032）
export { formBalancedTeams, TEAM_BALANCE_TOLERANCE, type FormBalancedTeamsOptions } from "./teams";
// 周回数の選択肢。説明役を回すゲームが共通で使う（ADR-0020、基本設計/16の設定）
export { LAPS_IDS, LAPS_OPTIONS, MAX_LAPS, isLapsId, lapsFromId, type LapsId } from "./laps";
export * from "./protocol";
export * from "./game-module";
export * from "./validate";
