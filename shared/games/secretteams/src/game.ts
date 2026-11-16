// SECRET TEAMSのランタイム型と表示文言の定数（基本設計/17_SECRETTEAMSゲームモジュール.md）。
//
// 公開状態・秘密情報・結果を別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
// チームの所属・各自の単語・本物のテーマ・回答の中身は、公開状態に現れない。
import type { ContentSummary } from "@beb/shared-core";
import type { KeyExpression, WordCard } from "./pack";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  /** 自分の単語とテーマ・選択肢・人数構成・説明の順番・約束の確認 */
  briefing: "briefing",
  /** 手番の人が自分の単語を英語で遠回しに説明する。手番1回につき1回入る */
  clue: "clue",
  /** 相談と回答。味方だと思う人と相手チームのテーマを伏せて出す */
  answering: "answering",
  /** 結果。遷移しない */
  reveal: "reveal",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** 自分の単語とテーマ、選択肢6件、人数構成、説明の順番を読む時間（17のステージ） */
export const BRIEFING_SECONDS = 90;

/** 相談と回答の締切（17のステージ） */
export const ANSWERING_SECONDS = 120;

/** 説明の周回数。設定にしない（17の設定） */
export const LAPS = 2;

/** 系統ごとに選択肢へ混ぜる近いテーマの数（17の「選択肢は6件で、本物のテーマごとに近いテーマを2件混ぜる」） */
export const NEAR_THEMES_PER_FAMILY = 2;

/** 選択肢の件数。系統2つから3件ずつ */
export const THEME_CHOICE_COUNT = 2 * (1 + NEAR_THEMES_PER_FAMILY);

/** 得点の重み。合流率と見抜き率を半分ずつ（17の「合流率と見抜き率」。未検証の仮置き） */
export const SCORE_WEIGHTS = {
  join: 50,
  spot: 50,
} as const;

/** 人数ごとの2チームの人数構成（17の「チーム編成と人数構成」の表） */
export const TEAM_SIZES: Readonly<Record<number, readonly number[]>> = {
  4: [2, 2],
  5: [3, 2],
  6: [3, 3],
  7: [4, 3],
  8: [4, 4],
};

/** 1人が選べる味方の上限。大きい方のチームの味方の数（最大のチーム人数 − 1） */
export function maxAllyPicksOf(sizes: readonly number[]): number {
  return Math.max(...sizes) - 1;
}

/** 手番の総数。参加人数 × 周回数 */
export function totalTurnsOf(publicState: Pick<SecretTeamsPublic, "speakerOrder" | "laps">): number {
  return publicState.speakerOrder.length * publicState.laps;
}

/** 手番の人。speakerOrder と turnIndex から決まり、別のフィールドに持たない（17の公開状態） */
export function speakerOf(publicState: Pick<SecretTeamsPublic, "speakerOrder" | "turnIndex">): string | undefined {
  if (publicState.speakerOrder.length === 0) {
    return undefined;
  }
  return publicState.speakerOrder[publicState.turnIndex % publicState.speakerOrder.length];
}

/** 何周目か（1始まり） */
export function lapOf(publicState: Pick<SecretTeamsPublic, "speakerOrder" | "turnIndex">): number {
  if (publicState.speakerOrder.length === 0) {
    return 1;
  }
  return Math.floor(publicState.turnIndex / publicState.speakerOrder.length) + 1;
}

/**
 * メンバー1人の合流の値（17の「合流率と見抜き率」）。
 *
 * max(0, 正しく選んだ味方の数 − 誤って選んだ相手の数) ÷ 自分の味方の数。
 * 誤った選択を差し引くのは、上限まで選べば味方を取りこぼさないという手を塞ぐためである。
 */
export function joinValueOf(correctAllyCount: number, wrongAllyCount: number, allyCount: number): number {
  if (allyCount <= 0) {
    return 0;
  }
  return Math.max(0, correctAllyCount - wrongAllyCount) / allyCount;
}

/**
 * チームの得点。round(合流率 × 50 + 見抜き率 × 50) で0〜100点になる（17の「合流率と見抜き率」）。
 *
 * 0.5は切り上げる。率は分数の平均であり浮動小数の誤差で 12.4999… になりうるため、微小な値を足してから丸める。
 */
export function teamScoreOf(joinRate: number, spotRate: number): number {
  return Math.round(joinRate * SCORE_WEIGHTS.join + spotRate * SCORE_WEIGHTS.spot + 1e-9);
}

/** テーマパックの公開メタ情報。テーマと単語を載せない（17のカタログ） */
export type SecretTeamsPackSummary = ContentSummary;

// --- 公開状態 ---

/** 選択肢1件。本物のテーマか近いテーマかを載せない */
export interface ThemeChoice {
  id: string;
  en: string;
  ja: string;
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * チームの所属・各自の単語・どの選択肢が本物のテーマか・回答の中身を含めない（ADR-0003、17の公開状態）。
 */
export interface SecretTeamsPublic {
  packId: string;
  /** 6件。start で乱数で並べた順。系統を載せない */
  themeChoices: ThemeChoice[];
  /** 人数構成。降順。テーマとは結び付けない */
  teamSizes: number[];
  /** 1人が選べる味方の上限 */
  maxAllyPicks: number;
  /** 説明の順（playerId）。2周とも同じ順 */
  speakerOrder: string[];
  laps: number;
  /** 0始まり。answering と reveal では最後の手番の値のまま残す */
  turnIndex: number;
  /** 手番の人の切断で飛ばした turnIndex */
  skippedTurns: number[];
  /** briefing の収集状況 */
  readyPlayerIds: string[];
  /** answering の収集状況。回答の中身は載せない */
  submittedPlayerIds: string[];
  keyExpressions: KeyExpression[];
  /** 1人の説明の時間。handleAction に Room の settings が渡らないため公開状態に持つ */
  clueSeconds: number;
}

// --- 秘密情報 ---

/** 回答。味方だと思う人と、相手チームのテーマだと思う選択肢 */
export interface Answer {
  /** 1〜maxAllyPicks 人 */
  allyIds: string[];
  opponentThemeId: string;
}

/**
 * 各プレイヤーへ配る自分用の情報。
 *
 * 味方のidは本人にも配らない。本ゲームは味方を推理するゲームであり、配ると推理する対象がなくなる。
 * 共通コアは playerSecrets[playerId] をペイロードごと差し替えるため、毎回全量を組み立てる。
 */
export interface SecretTeamsSecret {
  /** 自分の単語 */
  word: WordCard;
  /** 自分のチームのテーマ。themeChoices のどれか */
  themeId: string;
  /** 自分の回答。answering で受理するまで省略する */
  answer?: Answer;
}

// --- 結果 ---

export interface TeamMember {
  playerId: string;
  word: WordCard;
}

export interface TeamResult {
  theme: ThemeChoice;
  members: TeamMember[];
  /** 合流率（0〜1） */
  joinRate: number;
  /** 見抜き率（0〜1） */
  spotRate: number;
  /** 0〜100 */
  score: number;
}

export interface AnswerRecord {
  playerId: string;
  /** 未回答は null */
  answer: Answer | null;
  correctAllyCount: number;
  wrongAllyCount: number;
  themeCorrect: boolean;
}

export interface SecretTeamsResult {
  outcome: "win" | "draw";
  /** 勝ったチームのテーマ。引き分けは null */
  winnerThemeId: string | null;
  /** 2件 */
  teams: TeamResult[];
  /** 6件 */
  themeChoices: ThemeChoice[];
  /** 参加者全員分 */
  answers: AnswerRecord[];
  /** 開始時の参加者数 */
  playerCount: number;
}

// --- action ---

export const ACTIONS = {
  /** briefing の進行合意 */
  ready: "ready",
  /** 手番の人が説明を終える */
  done: "done",
  /** 回答を登録する。締切まで上書きできる */
  submit: "submit",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

export interface DonePayload {
  turnIndex: number;
}

export interface SubmitPayload {
  allyIds: string[];
  opponentThemeId: string;
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、17）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  /** 送信者が手番の人でない */
  notSpeaker: "not_speaker",
  /** turnIndex が数値でない、または現在の手番と違う */
  staleTurn: "stale_turn",
  /** allyIds が配列でない、opponentThemeId が文字列でない */
  invalidAnswer: "invalid_answer",
  /** allyIds が0件、上限超え、重複、自分を含む、参加者でないidを含む */
  invalidAlly: "invalid_ally",
  /** opponentThemeId が選択肢に無い、自分のテーマである */
  invalidTheme: "invalid_theme",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// --- 設定 ---

export interface SecretTeamsSettings {
  clueSeconds: number;
}

/**
 * 1人の説明の時間の既定値と許容範囲（17の設定）。
 *
 * step は入力の刻みであり、受理の条件にしない。
 */
export const CLUE_SECONDS = {
  default: 30,
  min: 20,
  max: 60,
  step: 10,
} as const;

/** ステージごとの画面見出し。ホスト画面とタイマーバーで同じ文言を使う（基本設計/02） */
export const STAGE_LABELS_JA: Record<Stage, string> = {
  briefing: "遊び方の確認",
  clue: "説明",
  answering: "回答",
  reveal: "結果",
};
