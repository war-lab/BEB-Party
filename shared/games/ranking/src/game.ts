// ENGLISH RANKINGのランタイム型と表示文言の定数（基本設計/10_ENGLISHRANKINGゲームモジュール.md）。
//
// 公開状態・秘密情報・結果を別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
// 現ラウンドの目標は秘密情報の型にだけ現れる。公開状態の型に現れるのは確定したラウンドの記録だけである。
import type { ContentSummary, Level } from "@beb/shared-core";
import type { KeyExpression, RankingItem } from "./pack";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  /** 項目セットの公開と、秘密の目標の配布 */
  briefing: "briefing",
  /** 英語で議論する。締切到達だけで進む */
  discussion: "discussion",
  /** ホストが順位を提案し、全員が承認して確定させる */
  confirming: "confirming",
  /** 確定順位・全員の目標・得点の開示 */
  reveal: "reveal",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** ロビーで変更できないステージの締切秒数。discussionだけがdiscussionSecondsで決まる */
export const STAGE_DEADLINE_SECONDS = {
  briefing: 90,
  confirming: 90,
  reveal: 90,
} as const;

/**
 * 1ゲームのラウンド数。
 *
 * 参加人数に依存させない。1ラウンドだと得点が0か2の2段階しかなく結果画面が成立せず、
 * 4ラウンド以上にすると議論時間の既定値で15分を超える（10の所要時間の見積り）。
 */
export const ROUNDS = 3;

/** 目標を達成したときの得点。未達は0点とし、減点は置かない（10の得点） */
export const POINTS_PER_GOAL = 2;

/** お題パックの公開メタ情報。ContentSummaryの実装（10のカタログ） */
export interface RankingPackSummary extends ContentSummary {
  setCount: number;
}

// --- 秘密情報 ---

/**
 * 各プレイヤーへ配る自分の目標。
 *
 * 他人の目標は含めない。見えると議論が「相手の目標を潰す」作業になり、
 * 英語で主張を組む動機が消える（10の秘密情報）。
 */
export interface RankingSecret {
  roundIndex: number;
  goal: {
    id: string;
    /** 目標の日本語文 */
    ja: string;
    /** 主張に使える英文の例。件数はレベルで変わる（hintCountFor） */
    hintEn: string[];
  };
}

// --- 公開状態 ---

export interface ScoreEntry {
  playerId: string;
  points: number;
}

/** 開示された1人分の目標。ラウンドが確定した時点で公開状態へ移る */
export interface RevealedGoal {
  playerId: string;
  ja: string;
  achieved: boolean;
}

/** 確定した1ラウンドの記録 */
export interface RoundRecord {
  setId: string;
  question: { en: string; ja: string };
  items: RankingItem[];
  /** 確定順位（itemIdの並び）。1位が先頭 */
  ranking: string[];
  goals: RevealedGoal[];
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * 現ラウンドの目標と、抽選で選んだ未使用セットのidを含めない（ADR-0003）。
 * 次のラウンドの項目が分かると、議論中に先の目標を考えられる。
 */
export interface RankingPublic {
  packId: string;
  roundIndex: number;
  totalRounds: number;
  /** 現ラウンドの問い */
  question: { en: string; ja: string };
  /** 現ラウンドの5項目。並びは定義順であり、確定順位ではない */
  items: RankingItem[];
  keyExpressions: KeyExpression[];
  /** briefing と reveal の収集状況 */
  readyPlayerIds: string[];
  /**
   * confirming中の提案（itemIdの並び）。まだ提案が無ければ null。
   *
   * 公開する。卓が「いまホストが入れた順位」を見て承認するための値であり、
   * 伏せると承認の意味がなくなる（10の公開状態）。
   */
  proposedRanking: string[] | null;
  /** 現在の提案への承認者。提案が差し替わると空になる */
  approvedPlayerIds: string[];
  scores: ScoreEntry[];
  /** 確定したラウンドの記録 */
  rounds: RoundRecord[];
  /** 確定した議論の秒数。handleActionにRoomのsettingsが渡らないため公開状態に持つ */
  discussionSeconds: number;
}

/** 得点表から1人分を引く。未登録なら0点として扱う */
export function pointsOf(scores: readonly ScoreEntry[], playerId: string): number {
  return scores.find((entry) => entry.playerId === playerId)?.points ?? 0;
}

/** 最終ラウンドかどうか */
export function isFinalRound(publicState: RankingPublic): boolean {
  return publicState.roundIndex >= publicState.totalRounds - 1;
}

// --- 結果 ---

export interface RankingResult {
  /** points降順 */
  scores: ScoreEntry[];
  /** 3ラウンド分。使わなかったセットは載せない（10の結果） */
  rounds: RoundRecord[];
}

// --- action ---

export const ACTIONS = {
  /** briefing と reveal の進行合意 */
  ready: "ready",
  /** ホストが卓の合意した順位を記録する */
  proposeRanking: "proposeRanking",
  /** 現在の提案を承認する。全員揃うと確定する */
  approveRanking: "approveRanking",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

/** proposeRanking のペイロード */
export interface ProposeRankingPayload {
  /** 5項目のitemIdの並び。1位が先頭 */
  ranking: string[];
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、10）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  /** 提案はホストに限る。入力者が2人以上だと締切直前の上書きで承認が無効化され続ける */
  notHost: "not_host",
  /** 要素数が5でない、未知のid、重複のいずれか */
  invalidRanking: "invalid_ranking",
  /** 提案が無い状態での承認 */
  noProposal: "no_proposal",
} as const;

// ready と approveRanking の二重送信は拒否しない。冪等に扱う（08・09と同じ）

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// --- 設定 ---

export interface RankingSettings {
  discussionSeconds: number;
}

/**
 * 議論の秒数の既定値と許容範囲。
 *
 * 範囲の根拠はゲームバランスであり、共通コアではなくこのモジュールが持つ（ADR-0012）。
 * 下限を60秒にするのは、5項目の並びを英語で議論するには短すぎる長さを避けるためである。
 * 上限を240秒にするのは、3ラウンドで回すと1ゲームが約18分になり、
 * 収録計画の受入条件「6人で15分以内」を超えるためである。
 */
export const DISCUSSION_SECONDS = {
  default: 120,
  min: 60,
  max: 240,
  step: 30,
} as const;

// --- 表示文言とレベル差の吸収 ---

/**
 * レベル別に渡す hintEn の件数。
 *
 * 収録は3件以上とし、渡す件数だけを変える（10のレベル差の吸収の第2層）。
 * レベル1〜2は主張の型から渡す必要があり、レベル3以上は方向づけだけで足りる。
 */
export function hintCountFor(level: Level): number {
  return level <= 2 ? 3 : 1;
}

/** ステージごとの画面見出し。ホスト画面とタイマーバーで同じ文言を使う（基本設計/02） */
export const STAGE_LABELS_JA: Record<Stage, string> = {
  briefing: "目標の確認",
  discussion: "議論",
  confirming: "順位の確定",
  reveal: "開示",
};
