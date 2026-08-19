// DON'T SAY ITのランタイム型と表示文言の定数（基本設計/09_DONTSAYITゲームモジュール.md）。
//
// 公開状態・秘密情報・結果を別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
// 人物名と禁止語は秘密情報の型にだけ現れる。公開状態の型には現れない。
import type { ContentSummary, Level } from "@beb/shared-core";
import type { ConstraintCard, KeyExpression } from "./set";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  briefing: "briefing",
  /** 次の説明者が1枚目を読む時間。explainingの締切の外に置く（09のステージ） */
  handoff: "handoff",
  explaining: "explaining",
  debrief: "debrief",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** ロビーで変更できないステージの締切秒数。explainingだけがroundSecondsで決まる */
export const STAGE_DEADLINE_SECONDS = {
  briefing: 120,
  handoff: 30,
} as const;

/** お題セットの公開メタ情報。ContentSummaryの実装（09のカタログ） */
export interface DontSayItSetSummary extends ContentSummary {
  cardCount: number;
}

// --- 秘密情報 ---

export type Role = "speaker" | "watcher" | "answerer";

/** 説明者に配る。人物名を見られるのはこの役だけである */
export interface SpeakerSecret {
  role: "speaker";
  card: { cardId: string; answer: string; taboo: string[] };
}

/**
 * 監視役に配る。禁止語と正解を渡す。
 *
 * 正解を渡すのは、説明者が正解そのものを口に出したときに押せるボタンが必要なためである。
 * 渡さない設計では、タブー系ゲームで最も基本的な違反を誰も申告できない。
 *
 * 正解を知る役になるため、監視役はそのラウンドの加点対象から外す（09の3役）。
 */
export interface WatcherSecret {
  role: "watcher";
  cardId: string;
  /** 説明者に提示したものと同じ集合。語数が違うと違反の判断がずれる */
  taboo: string[];
  /** 正解。説明者が口に出したかを判定するために渡す */
  answer: string;
}

/**
 * 回答者に配る。内容を持たない。
 *
 * 役が変わったことだけを伝えるために送る。中身のない型にしているのは、
 * 回答者の端末に人物名も禁止語も届かないことを型で示すためである。
 */
export interface AnswererSecret {
  role: "answerer";
}

export type DontSayItSecret = SpeakerSecret | WatcherSecret | AnswererSecret;

// --- 公開状態 ---

export interface ScoreEntry {
  playerId: string;
  points: number;
}

export interface RoundSummary {
  speakerPlayerId: string;
  watcherPlayerId: string;
  solved: number;
  violated: number;
  skipped: boolean;
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * 人物名・禁止語・制約カード・山札の残り枚数を含めない（ADR-0003）。
 * 残り枚数を伏せるのは、あと何枚あるかが分かると回答者が山札の構成を推測できるためである。
 */
export interface DontSayItPublic {
  setId: string;
  /** 説明者の順。全ラウンド分を最初に公開する（自分の順番が分かると心構えができる） */
  speakerOrder: string[];
  roundIndex: number;
  readyPlayerIds: string[];
  scores: ScoreEntry[];
  /** 終了したラウンドの記録 */
  rounds: RoundSummary[];
  /**
   * 現ラウンドの説明者に課された制約。説明者のレベルが5でなければnull。
   *
   * 秘密情報ではなく公開状態に置く。制約の遵守は場の耳で判定するため、
   * 説明者しか制約を知らないと、守れているかを誰も言えない（監視役も判定できない）。
   */
  constraint: ConstraintCard | null;
  solvedThisRound: number;
  /** 現ラウンドの違反件数。監視役が全員の前で押した操作であり、伏せる理由がない */
  violatedThisRound: number;
  skipUsedThisRound: boolean;
  /** 確定した1ラウンドの秒数。handleActionにRoomのsettingsが渡らないため公開状態に持つ */
  roundSeconds: number;
}

/**
 * 現在の説明者。
 *
 * speakerOrderとroundIndexから導く。専用のフィールドを置くと二重管理になる（09の公開状態）。
 */
export function speakerPlayerIdOf(publicState: DontSayItPublic): string | undefined {
  return publicState.speakerOrder[publicState.roundIndex];
}

/**
 * 現在の監視役。次のラウンドの説明者とし、最終ラウンドでは先頭へ戻る。
 *
 * この巡回により、全員が1回ずつ説明者と監視役を務める（09の3役）。
 */
export function watcherPlayerIdOf(publicState: DontSayItPublic): string | undefined {
  const { speakerOrder, roundIndex } = publicState;
  if (speakerOrder.length === 0) {
    return undefined;
  }
  return speakerOrder[(roundIndex + 1) % speakerOrder.length];
}

/**
 * 1ラウンドでカードを次へ送れる回数の上限。
 *
 * 成立・違反・スキップの合計に課す。上限に達した時点でそのラウンドを終える。
 * 上限がないと、1人が連打して山札を掘り尽くし、残りの参加者が説明者を務められないまま
 * ゲームが終わる（山札が尽きた時点で終局するため）。
 *
 * 締切到達時に表示中のカードも捨て札になるため、1ラウンドの最大消費枚数はこの値 + 1 である。
 */
export const MAX_CARD_ADVANCES_PER_ROUND = 5;

/**
 * そのラウンドでカードを次へ送った回数。
 *
 * 成立・違反・スキップのいずれもカードを1枚送るため、公開状態の3つの値から導ける。
 * 専用のフィールドを置くと二重管理になる。
 */
export function advancesOf(publicState: DontSayItPublic): number {
  return (
    publicState.solvedThisRound + publicState.violatedThisRound + (publicState.skipUsedThisRound ? 1 : 0)
  );
}

/** そのプレイヤーの現在の役 */
export function roleOf(publicState: DontSayItPublic, playerId: string): Role {
  if (speakerPlayerIdOf(publicState) === playerId) {
    return "speaker";
  }
  if (watcherPlayerIdOf(publicState) === playerId) {
    return "watcher";
  }
  return "answerer";
}

/** 得点表から1人分を引く。未登録なら0点として扱う */
export function pointsOf(scores: readonly ScoreEntry[], playerId: string): number {
  return scores.find((entry) => entry.playerId === playerId)?.points ?? 0;
}

// --- 結果 ---

export interface DontSayItResult {
  /** points降順 */
  scores: ScoreEntry[];
  rounds: RoundSummary[];
  /**
   * 使い終えたカードだけを開示する。
   *
   * 未使用のカードを載せない。同じセットを次のゲームでも使うため、
   * 山札の残りを見せると再利用できなくなる（09の結果）。
   */
  usedCards: { answer: string; taboo: string[] }[];
  keyExpressions: KeyExpression[];
}

// --- action ---

export const ACTIONS = {
  ready: "ready",
  /** 説明者が1枚目を読み終えて90秒を開始する */
  startRound: "startRound",
  /** 説明者が正解者を申告する。誰が当てたかをサーバは観測できないため申告を正とする */
  claimCorrect: "claimCorrect",
  /** 監視役が禁止語の使用を申告する */
  reportViolation: "reportViolation",
  /** 説明者がカードを飛ばす。1ラウンド1回 */
  skipCard: "skipCard",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

/** claimCorrect のペイロード */
export interface ClaimCorrectPayload {
  playerId: string;
  /** 表示中のカード。画面が1枚遅れている状態からの申告を弾くために送る */
  cardId: string;
}

/** reportViolation と skipCard のペイロード */
export interface CardActionPayload {
  cardId: string;
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、09）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  notSpeaker: "not_speaker",
  notWatcher: "not_watcher",
  invalidTarget: "invalid_target",
  /** 表示中でないカードへの操作 */
  staleCard: "stale_card",
  skipUsed: "skip_used",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// --- 設定 ---

export interface DontSayItSettings {
  roundSeconds: number;
}

/**
 * 1ラウンドの秒数の既定値と許容範囲。
 *
 * 範囲の根拠はゲームバランスであり、共通コアではなくこのモジュールが持つ（ADR-0012）。
 * 下限を60秒にするのは、1枚も成立しないまま終わるラウンドが増えるためである。
 * 上限を120秒にするのは、6人で回すと1ゲームの所要時間が1晩3ゲームの想定を超えるためである。
 */
export const ROUND_SECONDS = {
  default: 90,
  min: 60,
  max: 120,
} as const;

// --- 表示文言の定数（09の表） ---

/**
 * レベル別に提示する禁止語の数。
 *
 * 収録は常に5語とし、提示数だけを変える（09のレベル差の吸収）。
 * カード側に難度を持たせないのは、人物の知名度が英語力と相関しないためである。
 */
export const TABOO_COUNT: Record<Level, number> = {
  1: 3,
  2: 3,
  3: 4,
  4: 4,
  5: 5,
};

/** 制約カードを配る最小レベル。禁止語5語と制約の同時付与はレベル4には重い（09） */
export const CONSTRAINT_MIN_LEVEL = 5;

/** そのレベルの説明者へ提示する禁止語の数 */
export function tabooCountFor(level: Level): number {
  return TABOO_COUNT[level];
}

/** そのレベルの説明者に制約カードを配るか */
export function hasConstraint(level: Level): boolean {
  return level >= CONSTRAINT_MIN_LEVEL;
}

/**
 * 回答者の画面に出す呼びかけ。
 *
 * セットごとに変わらないためコンテンツに持たせない。
 * 当てる側の言い回しに限る。ゲームに依存しない言い方は共通コアが持つ（基本設計/02）。
 */
export const ANSWERER_PROMPTS = ["Is it a person?", "Say it again, please.", "One more hint!"];
