// SECRET RULE ENGLISHのランタイム型と表示文言の定数（基本設計/14_SECRETRULEゲームモジュール.md）。
//
// 公開状態・秘密情報・結果を別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
// 秘密の規則と、判定にかけた英文の成否は、秘密情報とゲーム秘密状態の側にだけ現れる（ADR-0031）。
import type { ContentSummary } from "@beb/shared-core";
import type { KeyExpression, Starter } from "./pack";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  /** 候補6件と語の数え方の確認 */
  briefing: "briefing",
  /** 各自が下書きを1つ書く */
  writing: "writing",
  /** 判定にかける下書きを卓が選ぶ。選べる下書きが2件以下なら飛ばす */
  choosing: "choosing",
  /** 書いた本人だけが成否を見て報告し、候補を選ぶ */
  checking: "checking",
  /** 正解の規則を満たし、避ける候補を満たさない英文を書く */
  proving: "proving",
  /** 結果。遷移しない */
  debrief: "debrief",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** ロビーで変更できないステージの締切秒数。writing と proving は writingSeconds で決まる */
export const STAGE_DEADLINE_SECONDS = {
  /** 候補6件と語の数え方の例を読む時間（14のステージ） */
  briefing: 90,
  choosing: 45,
  checking: 120,
} as const;

/** 候補の数。母集団から start で抽選する（14の「候補の抽選」） */
export const CANDIDATE_COUNT = 6;

/** 1ゲームのラウンド数の上限 */
export const MAX_ROUNDS = 4;

/**
 * 1ラウンドに判定にかける英文の上限。
 *
 * 人数分を判定すると、6人の卓は1ラウンドで正解が決まりうる（ADR-0031）。
 */
export const TESTS_PER_ROUND = 2;

/** choosing で1人が印を付けられる下書きの数 */
export const MARKS_PER_PLAYER = 2;

/** 規則パックの公開メタ情報。候補の母集団を載せない（14のカタログ） */
export type SecretRulePackSummary = ContentSummary;

// --- 秘密情報 ---

/** 判定にかかった自分の英文と成否 */
export interface OwnResult {
  roundIndex: number;
  text: string;
  passed: boolean;
}

/** 秘密情報を最後に送った時点の区分（14の「送るときと値」） */
export type SecretPhase = "briefing" | "writing" | "checking" | "proving";

/**
 * 各プレイヤーへ配る自分用の情報。
 *
 * 共通コアは playerSecrets[playerId] をペイロードごと差し替えるため、毎回全量を組み立てる。
 * 秘密の規則はどの参加者にも配らない。全員が当てる側である。
 */
export interface SecretRuleSecret {
  phase: SecretPhase;
  roundIndex: number;
  /** 現在の writing / proving の自分の提出。未提出なら省略する */
  draft?: string;
  /** 判定にかかった自分の英文の成否。全ラウンド分（ADR-0031） */
  results: OwnResult[];
}

// --- 公開状態 ---

export interface CandidatePublic {
  id: string;
  /** 言い回しのパラメータを置き換えた後の文 */
  textEn: string;
  textJa: string;
}

/** choosing / checking で公開する下書き */
export interface Draft {
  playerId: string;
  text: string;
}

/** choosing の印 */
export interface Mark {
  playerId: string;
  /** 0〜2件 */
  draftPlayerIds: string[];
}

/** 判定にかけた英文。成否は載せない（ADR-0031） */
export interface TestedEntry {
  roundIndex: number;
  playerId: string;
  text: string;
}

/** checking の選択 */
export interface Selection {
  playerId: string;
  candidateId: string;
}

export interface AnswerRecord {
  roundIndex: number;
  candidateId: string;
  correct: boolean;
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * 秘密の規則、避ける候補（proving まで）、判定の成否、writing / proving 中の提出テキストを含めない（ADR-0003、ADR-0031）。
 */
export interface SecretRulePublic {
  packId: string;
  /** 6件。start で抽選した順 */
  candidates: CandidatePublic[];
  /** 0始まり。proving と debrief では最後のラウンドのまま */
  roundIndex: number;
  maxRounds: number;
  /** briefing / choosing / checking の収集状況 */
  readyPlayerIds: string[];
  /** writing / proving の収集状況。テキストは載せない */
  submittedPlayerIds: string[];
  /** choosing / checking で、現ラウンドの選べる下書き。choosing を飛ばした回は判定にかけた下書き */
  drafts: Draft[];
  marks: Mark[];
  /** 判定にかけた英文。全ラウンド分。成否は載せない */
  entries: TestedEntry[];
  selections: Selection[];
  answers: AnswerRecord[];
  /** 正解の候補。正解するまで null */
  solvedCandidateId: string | null;
  /** 避ける候補。proving に入るまで null */
  avoidCandidateId: string | null;
  keyExpressions: KeyExpression[];
  starters: Starter[];
  /** 確定した書く時間。handleAction に Room の settings が渡らないため公開状態に持つ */
  writingSeconds: number;
}

// --- 結果 ---

/** 判定にかけた英文と成否 */
export interface TestedResult {
  roundIndex: number;
  playerId: string;
  text: string;
  passed: boolean;
}

export interface ProofEntry {
  playerId: string;
  text: string;
  passed: boolean;
}

export type Rank = "S" | "A" | "B" | "C";

export interface SecretRuleResult {
  outcome: "solved" | "unsolved";
  rank: Rank;
  /** 秘密の規則 */
  rule: CandidatePublic;
  /** 避ける候補 */
  avoid: CandidatePublic;
  candidates: CandidatePublic[];
  tested: TestedResult[];
  answers: AnswerRecord[];
  /** 正解したラウンド（1始まり）。正解なしは null */
  solvedRound: number | null;
  wrongCount: number;
  /** proving の提出と通過。正解なしなら空 */
  proofEntries: ProofEntry[];
  proofPassedCount: number;
  /** 開始時の参加者数 */
  playerCount: number;
}

/**
 * ランクの閾値（14の「結果」）。未検証の仮置きである。
 *
 * S: SOLVED_ROUND_FOR_S ラウンド目までに正解し、誤答0回、proving で参加者全員が通過。
 * A: 正解し、誤答 WRONG_LIMIT_FOR_A 回以下、proving で参加者の過半数が通過。
 */
export const RANK_THRESHOLDS = {
  solvedRoundForS: 2,
  wrongLimitForA: 1,
} as const;

// --- action ---

export const ACTIONS = {
  /** briefing / choosing / checking の進行合意 */
  ready: "ready",
  /** 英文を提出する。締切まで上書きできる */
  submit: "submit",
  /** choosing で判定にかけたい下書きに印を付ける */
  mark: "mark",
  /** checking で候補を選ぶ */
  select: "select",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

export interface SubmitPayload {
  text: string;
}

/** mark のペイロード。送った配列で、その人の印を置き換える */
export interface MarkPayload {
  roundIndex: number;
  draftPlayerIds: string[];
}

/** select のペイロード。null は選択の取り消し */
export interface SelectPayload {
  roundIndex: number;
  candidateId: string | null;
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、14）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  /** text が文字列でない */
  invalidSubmission: "invalid_submission",
  /** 正規化後の語数が MIN_WORDS 未満 */
  tooShort: "too_short",
  /** 正規化後の文字数が MAX_CHARS 超 */
  tooLong: "too_long",
  /** 比較キーが、判定にかけた過去の英文か、現在のステージの他人の提出と一致する */
  duplicate: "duplicate",
  /** roundIndex が数値でない、または現在のラウンドと違う */
  staleRound: "stale_round",
  /** 印の配列が不正 */
  invalidMark: "invalid_mark",
  /** 候補が不正、または誤答済み */
  invalidCandidate: "invalid_candidate",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// --- 設定 ---

export interface SecretRuleSettings {
  writingSeconds: number;
}

/**
 * 書く時間の既定値と許容範囲（14の設定）。
 *
 * 下書きは1つの仮説を確かめる短い英文で足りるため、11の90秒より短く見込む（未検証）。
 * step は入力の刻みであり、受理の条件にしない。
 */
export const WRITING_SECONDS = {
  default: 60,
  min: 45,
  max: 120,
  step: 15,
} as const;

/** ステージごとの画面見出し。ホスト画面とタイマーバーで同じ文言を使う（基本設計/02） */
export const STAGE_LABELS_JA: Record<Stage, string> = {
  briefing: "候補の確認",
  writing: "下書き",
  choosing: "試す英文を選ぶ",
  checking: "報告と回答",
  proving: "規則を使って書く",
  debrief: "結果",
};

/** 最終ラウンドかどうか */
export function isFinalRound(publicState: Pick<SecretRulePublic, "roundIndex" | "maxRounds">): boolean {
  return publicState.roundIndex >= publicState.maxRounds - 1;
}

/**
 * checking の終わりに回答となる候補（14の「回答はラウンドの終わりに判定する」）。
 *
 * 接続している人のうち、候補を選んだ人が1人以上いて、選んだ全員が同じ候補なら、その候補を返す。
 * 選んでいない人は棄権として扱う。画面の「この選択で回答になるか」の表示とサーバの判定が同じ関数を使う。
 */
export function agreedCandidateOf(
  selections: readonly Selection[],
  connectedPlayerIds: readonly string[],
): string | null {
  const chosen = selections.filter((entry) => connectedPlayerIds.includes(entry.playerId));
  const first = chosen[0];
  if (first === undefined) {
    return null;
  }
  return chosen.every((entry) => entry.candidateId === first.candidateId) ? first.candidateId : null;
}
