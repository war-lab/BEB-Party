// BLIND ROOMのランタイム型と表示文言の定数（基本設計/12_BLINDROOMゲームモジュール.md）。
//
// 公開状態・秘密情報・結果を別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
// 見本と聞き手の盤面は、開示までは秘密情報とゲーム秘密状態の側にだけ現れる。
import type { ContentSummary, Level } from "@beb/shared-core";
import type { Board } from "./board";
import type { ItemDefinition, KeyExpression } from "./pack";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  /** 遊び方とアイテムの確認 */
  briefing: "briefing",
  /** 次の説明者へ見本を渡す。説明者だけが開始を押せる */
  handoff: "handoff",
  /** 説明者が英語で伝え、聞き手が同じ配置を作る */
  building: "building",
  /** 見本と全員の盤面、一致数と得点の開示 */
  reveal: "reveal",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** ロビーで変更できないステージの締切秒数。buildingだけがbuildingSecondsで決まる */
export const STAGE_DEADLINE_SECONDS = {
  briefing: 60,
  /** 次の説明者が見本を読む時間。制限時間の外に置く（12のステージ） */
  handoff: 30,
  reveal: 45,
} as const;

/** お題パックの公開メタ情報。ContentSummaryの実装（12のカタログ） */
export interface BlindRoomPackSummary extends ContentSummary {
  itemSetCount: number;
}

/** 盤面に出すアイテムの表示情報。コンテンツの ItemDefinition をそのまま配る */
export type PaletteItem = ItemDefinition;

// --- 秘密情報 ---

/** 説明者へ配る情報。見本はこの経路でしか渡らない（ADR-0003） */
export interface DescriberSecret {
  roundIndex: number;
  role: "describer";
  sample: Board;
  /** 位置表現の枠。件数はレベルで変わる（hintCountFor） */
  hintEn: string[];
}

/**
 * 聞き手へ配る情報。自分の盤面を含め、再接続で復元できるようにする（12の秘密情報）。
 *
 * 言い回しは持たせない。質問に使う言い回しは全員が使う値であり、公開状態の keyExpressions に載る。
 * 同じ一覧を秘密側にも配ると、公開済みの値を二重に持つだけになる。
 */
export interface ListenerSecret {
  roundIndex: number;
  role: "listener";
  board: Board;
}

/**
 * 各プレイヤーへ配る自分用の情報。
 *
 * 送り直すときは常に全体を組み立てる。共通コアは playerSecrets[playerId] を
 * ペイロードごと差し替えるため、board だけを返すと hintEn が消える（12の秘密情報）。
 */
export type BlindRoomSecret = DescriberSecret | ListenerSecret;

// --- 公開状態 ---

export interface ScoreEntry {
  playerId: string;
  points: number;
}

/** 聞き手1人の盤面と採点結果。reveal で初めて公開する */
export interface BoardResult {
  playerId: string;
  cells: Board;
  /** 一致したマス数（0〜PLACE_COUNT） */
  matched: number;
}

/**
 * 確定した1ラウンドの記録。
 *
 * 開示中のラウンドも確定したラウンドもこの型1つで表す。開示用の別フィールドを持たせると、
 * 同じ内容が公開状態の2箇所に載り、移し替えの経路が増える。開示画面は末尾の1件を読む。
 */
export interface RoundRecord {
  roundIndex: number;
  describerId: string;
  itemSetId: string;
  sample: Board;
  boards: BoardResult[];
  describerPoints: number;
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * building中の見本と聞き手の盤面、次のラウンドのアイテムセットを含めない（ADR-0003）。
 */
export interface BlindRoomPublic {
  packId: string;
  roundIndex: number;
  /** 参加人数と同じ。全員が1回ずつ説明者を務める */
  totalRounds: number;
  /** 全ラウンド分の説明者。卓の進行を読めるように公開する（12の公開状態） */
  describerOrder: string[];
  itemSetId: string;
  /** 現ラウンドのアイテム一覧。他のセットは載せない */
  palette: PaletteItem[];
  placeCount: number;
  /** briefing と reveal の収集状況 */
  readyPlayerIds: string[];
  /** building の完了申告。盤面は載せない */
  donePlayerIds: string[];
  keyExpressions: KeyExpression[];
  /** 確定したラウンドの記録。末尾が直近の開示対象になる */
  rounds: RoundRecord[];
  scores: ScoreEntry[];
  /** 確定した配置の秒数。handleActionにRoomのsettingsが渡らないため公開状態に持つ */
  buildingSeconds: number;
}

/** そのラウンドの説明者。describerOrderの範囲外ならundefined */
export function describerPlayerIdOf(publicState: BlindRoomPublic): string | undefined {
  return publicState.describerOrder[publicState.roundIndex];
}

/** 得点表から1人分を引く。未登録なら0点として扱う */
export function pointsOf(scores: readonly ScoreEntry[], playerId: string): number {
  return scores.find((entry) => entry.playerId === playerId)?.points ?? 0;
}

/** 最終ラウンドかどうか */
export function isFinalRound(publicState: BlindRoomPublic): boolean {
  return publicState.roundIndex >= publicState.totalRounds - 1;
}

/**
 * 説明者の得点。接続中の聞き手の一致数の平均を切り捨てる。
 *
 * 平均から未接続の聞き手を除くのは、途中で落ちた端末の0点が説明者の得点を削るためである。
 * 聞き手が0人のラウンドでは0点とする（12の得点）。
 */
export function describerPointsOf(matches: readonly number[]): number {
  if (matches.length === 0) {
    return 0;
  }
  const total = matches.reduce((sum, value) => sum + value, 0);
  return Math.floor(total / matches.length);
}

// --- 結果 ---

export interface BlindRoomResult {
  /** points降順 */
  scores: ScoreEntry[];
  /** 実施したラウンド。飛ばしたラウンドは載せない（12の結果） */
  rounds: RoundRecord[];
  /**
   * 使用したアイテムセットの全アイテム。
   *
   * 結果画面が盤面を描くのにidから表示物を引く必要があり、finishedのまま再接続した人へは
   * 共通コアが lastResult を再送するため、公開状態に依存させない（12の結果）。
   */
  items: PaletteItem[];
}

// --- action ---

export const ACTIONS = {
  /** briefing と reveal の進行合意 */
  ready: "ready",
  /** 説明者が見本を読み終えて配置を始める */
  startRound: "startRound",
  /** 盤面を上書きする。締切まで何度でも送れる */
  place: "place",
  /** 完了申告。取り消せる */
  done: "done",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

/** place のペイロード。差分ではなく9マスの現在値を送る（12のplace） */
export interface PlacePayload {
  cells: Board;
}

/** done のペイロード。取り消しがあるため真偽値を取る */
export interface DonePayload {
  done: boolean;
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、12）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  /** 説明者以外が startRound を送った */
  notDescriber: "not_describer",
  /** 説明者が place / done を送った。見本を持つ側は盤面を作らない */
  describerCannotPlace: "describer_cannot_place",
  /** cells が9要素の配列でない、要素が文字列でもnullでもない */
  invalidBoard: "invalid_board",
  /** 現ラウンドのパレットに無いidが含まれる */
  unknownItem: "unknown_item",
  /** 置いたアイテムが PLACE_COUNT を超える */
  tooManyItems: "too_many_items",
  /** 同じアイテムが2マス以上にある */
  duplicateItem: "duplicate_item",
} as const;

// ready の二重送信は拒否しない。冪等に扱う（08・09・10・11と同じ）

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// --- 設定 ---

export interface BlindRoomSettings {
  buildingSeconds: number;
}

/**
 * 配置の秒数の既定値と許容範囲。
 *
 * 既定を75秒とするのは、5個の配置に対して質問1〜2往復が入る想定であるためである（未検証）。
 * 上限を120秒にするのは、6人・人数分のラウンドで1ゲームが約16.5分になり、
 * 収録計画の受入条件「6人で15分以内」を超えるためである（12の所要時間の見積り）。
 * step は入力の刻みであり、受理の条件にしない（範囲内の整数なら受理する）。
 */
export const BUILDING_SECONDS = {
  default: 75,
  min: 60,
  max: 120,
  step: 15,
} as const;

// --- 表示文言とレベル差の吸収 ---

/**
 * レベル別に渡す hintEn の件数。
 *
 * 収録は4件以上とし、渡す件数だけを変える（12のレベル差の吸収の第2層）。
 * 説明者にも聞き手にも同じ規則を使う。
 */
export function hintCountFor(level: Level): number {
  return level <= 2 ? 4 : 2;
}

/** ステージごとの画面見出し。ホスト画面とタイマーバーで同じ文言を使う（基本設計/02） */
export const STAGE_LABELS_JA: Record<Stage, string> = {
  briefing: "部屋の確認",
  handoff: "説明者の交代",
  building: "配置",
  reveal: "答え合わせ",
};
