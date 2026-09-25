// ESCAPE CALLのランタイム型と表示文言の定数（基本設計/13_ESCAPECALLゲームモジュール.md）。
//
// 公開状態・秘密情報・結果を別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
// 錠の答え・並び・対応表・規則は、解錠まで秘密情報とゲーム秘密状態の側にだけ現れる。
import type { ContentSummary } from "@beb/shared-core";
import type { MapEntry, Piece, PieceKind } from "./lock";
import type { KeyExpression, SceneText } from "./pack";
import type { RuleId } from "./rules";
import type { SymbolId } from "./symbols";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  /** 舞台の導入と、色と形の英語名の確認 */
  briefing: "briefing",
  /** 断片を伝え合って3つの錠を開ける。締切は通しの1本 */
  solving: "solving",
  /** 脱出の成否と、全錠の答えと断片の開示 */
  debrief: "debrief",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** ロビーで変更できないステージの締切秒数。solving は escapeSeconds で決まる */
export const STAGE_DEADLINE_SECONDS = {
  /** 色と形の英語名と、画面を見せない約束を読む時間（13のステージ） */
  briefing: 90,
} as const;

/** 舞台パックの公開メタ情報。規則の言い回しを含めない（13のカタログ） */
export type EscapeCallPackSummary = ContentSummary;

// --- 秘密情報 ---

/**
 * 各プレイヤーへ配る自分用の情報。いま挑戦中の錠の断片の全量を入れる。
 *
 * 共通コアは playerSecrets[playerId] をペイロードごと差し替えるため、差分だけを送ると
 * 再接続した人の手元から断片が消える。錠が開くたびに全員へ全量を送り直す（13の秘密情報）。
 */
export interface EscapeCallSecret {
  lockIndex: number;
  pieces: Piece[];
}

// --- 公開状態 ---

export interface LockPublic {
  index: number;
  labelEn: string;
  labelJa: string;
  codeLength: number;
  opened: boolean;
}

/** いま挑戦中の錠で、誰がどの種類の断片を持つか。中身は載せない（13の公開状態） */
export interface HolderEntry {
  playerId: string;
  kinds: PieceKind[];
}

export interface AttemptEntry {
  lockIndex: number;
  playerId: string;
  code: string;
  accepted: boolean;
}

export interface HintEntry {
  lockIndex: number;
  /** 0始まり。左からの桁位置 */
  position: number;
  digit: string;
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * 錠の答え・並び・対応表・規則の文を含めない（ADR-0003）。
 */
export interface EscapeCallPublic {
  packId: string;
  scene: SceneText;
  locks: LockPublic[];
  /** 0〜2。脱出後は LOCK_COUNT と同じ値になる */
  currentLockIndex: number;
  holders: HolderEntry[];
  /** briefing の収集状況 */
  readyPlayerIds: string[];
  /** 提出の履歴。全錠ぶん */
  attempts: AttemptEntry[];
  /** 開示済みのヒント。全錠ぶん */
  hints: HintEntry[];
  keyExpressions: KeyExpression[];
  /** 確定した制限時間。handleActionにRoomのsettingsが渡らないため公開状態に持つ */
  escapeSeconds: number;
}

/** いま挑戦中の錠。脱出後は undefined */
export function currentLockOf(publicState: EscapeCallPublic): LockPublic | undefined {
  return publicState.locks[publicState.currentLockIndex];
}

/** その錠で開示済みのヒントの数 */
export function hintCountOf(publicState: EscapeCallPublic, lockIndex: number): number {
  return publicState.hints.filter((hint) => hint.lockIndex === lockIndex).length;
}

// --- 結果 ---

export type Rank = "S" | "A" | "B" | "C" | "D";

export interface LockSolution {
  index: number;
  labelEn: string;
  labelJa: string;
  opened: boolean;
  order: SymbolId[];
  map: MapEntry[];
  /** textEn はその錠で規則を持った人に配った英文。textJa は振り返り用に常に入れる */
  rules: { ruleId: RuleId; textEn: string; textJa: string }[];
  code: string;
  holders: HolderEntry[];
}

export interface EscapeCallResult {
  outcome: "escaped" | "time_up";
  rank: Rank;
  openedCount: number;
  hintCount: number;
  wrongCount: number;
  /** 開かなかった錠も含む */
  locks: LockSolution[];
}

/**
 * ランクを決める（13の結果）。残り時間は使わない。handleActionは時刻に触れないためである。
 * 閾値は未検証の仮置きであり、実プレイでS・Aの出方を見て見直す。
 */
export function rankOf(escaped: boolean, openedCount: number, hintCount: number, wrongCount: number): Rank {
  if (escaped) {
    if (hintCount === 0 && wrongCount <= 2) {
      return "S";
    }
    if (hintCount <= 2 && wrongCount <= 5) {
      return "A";
    }
    return "B";
  }
  return openedCount > 0 ? "C" : "D";
}

// --- action ---

export const ACTIONS = {
  /** briefing の進行合意 */
  ready: "ready",
  /** いま挑戦中の錠へ答えを提出する */
  submit: "submit",
  /** いま挑戦中の錠の答えを1桁開示する。ホストだけが送れる */
  hint: "hint",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

/** submit のペイロード。錠の番号を含めない。対象は常にいま挑戦中の錠である（13のsubmit） */
export interface SubmitPayload {
  code: string;
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、13）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  /** 数字以外を含む、桁数が錠と違う、文字列でない */
  invalidCode: "invalid_code",
  /** 同じ錠へ同じ答えをすでに提出している */
  alreadyAttempted: "already_attempted",
  /** ホスト以外が hint を送った */
  notHost: "not_host",
  /** 開示できる桁（codeLength - 1）を超えた */
  noMoreHints: "no_more_hints",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** 答えの形。数字だけ。桁数は錠ごとに照合する */
export const CODE_PATTERN = /^[0-9]+$/;

// --- 設定 ---

export interface EscapeCallSettings {
  escapeSeconds: number;
}

/**
 * 制限時間の既定値と許容範囲（13の設定）。
 *
 * 既定600秒は錠1つに3分強を見込む値であり、未検証である。
 * 下限300秒は、錠1つに100秒を下回ると断片の読み上げと聞き返しが1往復で終わらないため。
 * 上限900秒は、1晩に3ゲームという想定に収めるため。
 * step は入力の刻みであり、受理の条件にしない（範囲内の整数なら受理する）。
 */
export const ESCAPE_SECONDS = {
  default: 600,
  min: 300,
  max: 900,
  step: 60,
} as const;

/** ステージごとの画面見出し。ホスト画面とタイマーバーで同じ文言を使う（基本設計/02） */
export const STAGE_LABELS_JA: Record<Stage, string> = {
  briefing: "作戦会議",
  solving: "解錠",
  debrief: "ふりかえり",
};
