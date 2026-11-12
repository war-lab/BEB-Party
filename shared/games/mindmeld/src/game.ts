// MIND MELDのランタイム型と表示文言の定数（基本設計/15_MINDMELDゲームモジュール.md）。
//
// 公開状態・秘密情報・結果を別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
// input 中の提出した語と、後のラウンドのお題は、秘密情報とゲーム秘密状態の側にだけ現れる。
import type { ContentSummary } from "@beb/shared-core";
import type { KeyExpression } from "./pack";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  /** 遊び方・チーム・申告の基準・口頭の約束の確認 */
  briefing: "briefing",
  /** 語を出す人が1語ずつ提出する */
  input: "input",
  /** 全チームの語の開示と、近い語の申告・異議 */
  reveal: "reveal",
  /** 結果。遷移しない */
  debrief: "debrief",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** 遊び方と申告の手順を読む時間（15のステージ） */
export const BRIEFING_SECONDS = 90;

/** reveal の締切。申告を受理したときもこの秒数で置き直す（15のステージ） */
export const REVEAL_SECONDS = 30;

/** 1ゲームのお題の数（ラウンド数） */
export const MAX_ROUNDS = 4;

/** 1つのお題で語を出せる回数の上限 */
export const MAX_ATTEMPTS = 4;

/** チームのラベル。編成の並び順に付ける（15の「チームの編成と3人組」） */
export const TEAM_LABELS = ["A", "B", "C", "D"] as const;

/**
 * 人数ごとのチームの人数構成（15の「チームの編成と3人組」の表）。
 *
 * 奇数の人数では3人組を1つ作る。3人組は試行ごとに語を出す2人を交代する。
 */
export const TEAM_SIZES: Readonly<Record<number, readonly number[]>> = {
  4: [2, 2],
  5: [2, 3],
  6: [2, 2, 2],
  7: [2, 2, 3],
  8: [2, 2, 2, 2],
};

/** ラウンドの a 回目（0始まりの attemptIndex）で一致したときの点（15の「得点」） */
export function pointsFor(attemptIndex: number): number {
  return MAX_ATTEMPTS - attemptIndex;
}

/**
 * 申告を認めるか（15の「近い語の申告と異議」）。
 *
 * 接続中の異議の数が、接続中の判定者の数の半分を超えていれば退ける。判定者が0人なら認める。
 * サーバの判定と、画面の「このままなら認められる」の表示が同じ関数を使う。
 */
export function isClaimAccepted(objectorCount: number, judgeCount: number): boolean {
  return objectorCount * 2 <= judgeCount;
}

/** お題パックの公開メタ情報。お題の一覧を載せない（15のカタログ） */
export type MindMeldPackSummary = ContentSummary;

// --- 公開状態 ---

export interface TeamPublic {
  id: string;
  /** "A"〜"D" */
  label: string;
  /** 2人、または3人組の3人。交代の順 */
  memberIds: string[];
}

export interface PromptPublic {
  id: string;
  en: string;
  ja: string;
}

export interface WordEntry {
  playerId: string;
  /** 表示形。未提出は null */
  word: string | null;
}

export interface ClaimPublic {
  claimedBy: string;
  objectorIds: string[];
  /** reveal の終わりで決まる。それまで null */
  accepted: boolean | null;
}

export interface TeamAttempt {
  teamId: string;
  /** 2件。語を出した2人の順 */
  words: WordEntry[];
  /** 照合キーが一致した */
  exact: boolean;
  /** 近い語である。2人がともに語を持ち、照合キーが一致しないときに限り真になりうる */
  near: boolean;
  claim: ClaimPublic | null;
  /** reveal の終わりで決まる。それまで null */
  matched: boolean | null;
}

export interface AttemptPublic {
  attemptIndex: number;
  /** この試行で語を出したチームだけ */
  teams: TeamAttempt[];
}

export interface MatchedAt {
  teamId: string;
  /** 1始まり。一致しなければ null */
  attempt: number | null;
}

export interface RoundSummary {
  roundIndex: number;
  prompt: PromptPublic;
  attempts: AttemptPublic[];
  matchedAt: MatchedAt[];
}

export interface TeamScore {
  teamId: string;
  points: number;
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * input 中の提出した語と、後のラウンドのお題を含めない（ADR-0003、15の公開状態）。
 */
export interface MindMeldPublic {
  packId: string;
  /** start で編成した順 */
  teams: TeamPublic[];
  /** 0始まり。debrief では最後のラウンドのまま */
  roundIndex: number;
  maxRounds: number;
  /** 0始まり。ラウンドごとに0へ戻る */
  attemptIndex: number;
  maxAttempts: number;
  /** いまのお題。briefing 中は null */
  prompt: PromptPublic | null;
  /** この試行で語を出す人 */
  activePlayerIds: string[];
  /** input の収集状況。語は載せない */
  submittedPlayerIds: string[];
  /** briefing / reveal の収集状況 */
  readyPlayerIds: string[];
  /** このラウンドで出せない照合キー */
  usedKeys: string[];
  /** このラウンドの開示済みの試行 */
  attempts: AttemptPublic[];
  /** 終わったラウンドの記録 */
  rounds: RoundSummary[];
  /** 累計点。teams の順 */
  scores: TeamScore[];
  keyExpressions: KeyExpression[];
  /** 確定した語を出す時間。handleAction に Room の settings が渡らないため公開状態に持つ */
  inputSeconds: number;
}

// --- 秘密情報 ---

/**
 * 各プレイヤーへ配る自分用の情報。
 *
 * 共通コアは playerSecrets[playerId] をペイロードごと差し替えるため、毎回全量を組み立てる。
 * クライアントは公開状態の roundIndex / attemptIndex と一致しない秘密を表示しない。
 */
export interface MindMeldSecret {
  roundIndex: number;
  attemptIndex: number;
  /** この試行で自分が提出した語（表示形）。未提出なら省略する */
  word?: string;
}

// --- 結果 ---

export interface Standing {
  teamId: string;
  points: number;
  /** 1始まり。同点は同じ順位 */
  place: number;
  /** 一致したラウンドの数 */
  matchedCount: number;
}

export interface MindMeldResult {
  teams: TeamPublic[];
  /** 点の高い順 */
  standings: Standing[];
  /** 全ラウンド */
  rounds: RoundSummary[];
  /** 開始時の参加者数 */
  playerCount: number;
}

// --- action ---

export const ACTIONS = {
  /** briefing / reveal の進行合意 */
  ready: "ready",
  /** 語を提出する。締切まで上書きできる */
  submit: "submit",
  /** 自分のチームの2語を同じ語と申告する */
  claim: "claim",
  /** 申告への異議を出す、または取り下げる */
  object: "object",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

export interface SubmitPayload {
  roundIndex: number;
  attemptIndex: number;
  word: string;
}

export interface ClaimPayload {
  roundIndex: number;
  attemptIndex: number;
}

export interface ObjectPayload {
  roundIndex: number;
  attemptIndex: number;
  teamId: string;
  /** false は異議の取り下げ */
  objecting: boolean;
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、15）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  /** roundIndex か attemptIndex が数値でない、または現在の値と違う */
  staleAttempt: "stale_attempt",
  /** 送信者がこの試行で語を出す人でない */
  notActive: "not_active",
  /** word が文字列でない、または正規化後に表示形の条件を満たさない */
  invalidWord: "invalid_word",
  /** 照合キーが usedKeys にある */
  usedWord: "used_word",
  /** 送信者のチームがこの試行で語を出していない、または近い語でない */
  notClaimable: "not_claimable",
  /** 申告が無いチームへの異議、申告したチームの人の異議、objecting が真偽値でない */
  invalidObjection: "invalid_objection",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// --- 設定 ---

export interface MindMeldSettings {
  inputSeconds: number;
}

/**
 * 語を出す時間の既定値と許容範囲（15の設定）。
 *
 * step は入力の刻みであり、受理の条件にしない。
 */
export const INPUT_SECONDS = {
  default: 30,
  min: 20,
  max: 60,
  step: 10,
} as const;

/** ステージごとの画面見出し。ホスト画面とタイマーバーで同じ文言を使う（基本設計/02） */
export const STAGE_LABELS_JA: Record<Stage, string> = {
  briefing: "遊び方の確認",
  input: "語を出す",
  reveal: "開示",
  debrief: "結果",
};

/** 最終ラウンドかどうか */
export function isFinalRound(publicState: Pick<MindMeldPublic, "roundIndex" | "maxRounds">): boolean {
  return publicState.roundIndex >= publicState.maxRounds - 1;
}
