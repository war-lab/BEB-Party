// WHO WROTE THIS?のランタイム型と表示文言の定数（基本設計/11_WHOWROTETHISゲームモジュール.md）。
//
// 公開状態・秘密情報・結果を別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
// 提出テキストの作者と指名先は秘密情報とゲーム秘密状態の側にだけ現れる。
import type { ContentSummary, Level } from "@beb/shared-core";
import type { KeyExpression } from "./pack";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  /** 質問の公開と、言い回しの例の配布 */
  briefing: "briefing",
  /** 各自が英文を1つ提出する */
  writing: "writing",
  /** 提出を1件ずつ開示し、作者を指名する */
  guessing: "guessing",
  /** 1件の答え合わせ。操作を持たず締切だけで進む */
  judging: "judging",
  /** ラウンドの得点開示 */
  reveal: "reveal",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** ロビーで変更できないステージの締切秒数。writingだけがwritingSecondsで決まる */
export const STAGE_DEADLINE_SECONDS = {
  briefing: 60,
  /** 開示1件ごとに張り直す */
  guessing: 40,
  /** 指名の内訳を読む時間。短くすると誰が引っかかったかを言い合えない（11のステージ） */
  judging: 12,
  reveal: 90,
} as const;

/**
 * 1ゲームのラウンド数（質問数）。
 *
 * 参加人数に依存させない。1ラウンドだと得点の段階が半分になり、3ラウンドにすると
 * 6人で15分を超える（11の所要時間の見積り）。
 */
export const ROUNDS = 2;

/** 指名が正解したときの得点 */
export const POINTS_PER_CORRECT_GUESS = 1;

/**
 * 自分の提出を誰にも当てられなかったときの得点。
 *
 * 原案の2点から下げている。レベル1〜2の提出は文体が目立って特定されやすく、
 * 隠し通しを厚くすると上級者に偏る（11のレベル差の吸収）。
 */
export const POINTS_PER_HIDDEN = 1;

/** お題パックの公開メタ情報。ContentSummaryの実装（11のカタログ） */
export interface WhoWroteThisPackSummary extends ContentSummary {
  questionCount: number;
}

// --- 秘密情報 ---

/**
 * 各プレイヤーへ配る自分用の情報。
 *
 * 送り直すときは常に全体を組み立てる。共通コアは playerSecrets[playerId] を
 * ペイロードごと差し替えるため、submission だけを返すと hintEn が消える（11の秘密情報）。
 */
export interface WhoWroteThisSecret {
  roundIndex: number;
  /** 件数はレベルで変わる（hintCountFor） */
  hintEn: string[];
  /** 自分の提出。未提出なら省略する */
  submission?: string;
  /**
   * このラウンドの開示順における自分の位置。
   *
   * 開示中の PresentedItem.slot と突き合わせて「自分の文が出ているか」を判定する。
   * 他人のslotは配らない。
   */
  slot: number;
}

// --- 公開状態 ---

export interface ScoreEntry {
  playerId: string;
  points: number;
}

/** 1件の指名 */
export interface GuessRecord {
  playerId: string;
  targetPlayerId: string;
}

/** 答え合わせを終えた1件。作者と指名の内訳はこの時点で公開になる */
export interface RevealedItem {
  index: number;
  text: string;
  authorId: string;
  guesses: GuessRecord[];
}

/**
 * guessing / judging で表示中の1件。
 *
 * text は公開する。開示中の1件は全員が読むための値であり、伏せると指名ができない。
 * 作者は gameSecret に置いたままにする（11の公開状態）。
 */
export interface PresentedItem {
  /** 現ラウンドの何件目か（0始まり） */
  index: number;
  /** 現ラウンドの開示件数 */
  total: number;
  text: string;
  /**
   * 作者の開示順における位置（未提出者を除く前の並びでの添字）。
   *
   * 自分が作者かどうかは、本人だけが持つ WhoWroteThisSecret.slot との一致で判定する。
   * 全員が提出した回では index と同じ値になり、開示の順序から読める情報しか持たない。
   * 他人のslotは配らないため、この値から作者は割れない。
   *
   * 乱数から識別子を振らない。mulberry32は32bitの状態を加算で進めるため、
   * 自分の識別子1つから状態を総当たりすれば全系列を復元でき、全員の作者が割れる。
   */
  slot: number;
  /** 指名を済ませた人。指名先は載せない（先に見えると同調が起きる） */
  guessedPlayerIds: string[];
}

/** 確定した1ラウンドの記録 */
export interface RoundRecord {
  questionId: string;
  question: { en: string; ja: string };
  items: RevealedItem[];
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * writing中の提出テキスト、開示中の件の作者、未開示の件、抽選した質問のidを含めない（ADR-0003）。
 */
export interface WhoWroteThisPublic {
  packId: string;
  roundIndex: number;
  totalRounds: number;
  question: { en: string; ja: string };
  keyExpressions: KeyExpression[];
  /** briefing と reveal の収集状況 */
  readyPlayerIds: string[];
  /** writing の収集状況。テキストは載せない */
  submittedPlayerIds: string[];
  /** guessing / judging で表示中の1件。それ以外のステージでは null */
  presented: PresentedItem | null;
  /** 現ラウンドの答え合わせ済みの件。reveal へ入るときに rounds へ移して空へ戻す */
  revealedItems: RevealedItem[];
  /** ゲーム全体の通算得点 */
  scores: ScoreEntry[];
  /** 確定したラウンドの記録 */
  rounds: RoundRecord[];
  /** 確定した英作文の秒数。handleActionにRoomのsettingsが渡らないため公開状態に持つ */
  writingSeconds: number;
}

/** 得点表から1人分を引く。未登録なら0点として扱う */
export function pointsOf(scores: readonly ScoreEntry[], playerId: string): number {
  return scores.find((entry) => entry.playerId === playerId)?.points ?? 0;
}

/** 最終ラウンドかどうか */
export function isFinalRound(publicState: WhoWroteThisPublic): boolean {
  return publicState.roundIndex >= publicState.totalRounds - 1;
}

// --- 結果 ---

export interface WhoWroteThisResult {
  /** points降順 */
  scores: ScoreEntry[];
  /** 2ラウンド分。使わなかった質問は載せない（11の結果） */
  rounds: RoundRecord[];
}

// --- action ---

export const ACTIONS = {
  /** briefing と reveal の進行合意 */
  ready: "ready",
  /** 英文を提出する。締切まで上書きできる */
  submit: "submit",
  /** 表示中の提出の作者を指名する */
  guess: "guess",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

/** submit のペイロード */
export interface SubmitPayload {
  text: string;
}

/** guess のペイロード。index は開示が進んだ後の遅着を弾くために要求する（11の guess） */
export interface GuessPayload {
  index: number;
  targetPlayerId: string;
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、11）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  /** text が文字列でない */
  invalidSubmission: "invalid_submission",
  /** 正規化後の語数が MIN_WORDS 未満 */
  tooShort: "too_short",
  /** 正規化後の文字数が MAX_CHARS 超 */
  tooLong: "too_long",
  /** index が表示中の件と一致しない（開示が進んだ後の遅着） */
  staleGuess: "stale_guess",
  /** 表示中の件の作者からの指名。成立しない操作である */
  ownSubmission: "own_submission",
  /** 指名の二重送信。初回が正（DETECTIVESのvoteと同じ扱い） */
  alreadyGuessed: "already_guessed",
  /** 指名先が現ラウンドの提出者でない、または送信者自身 */
  invalidTarget: "invalid_target",
} as const;

// ready の二重送信は拒否しない。冪等に扱う（08・09・10と同じ）

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// --- 設定 ---

export interface WhoWroteThisSettings {
  writingSeconds: number;
}

/**
 * 英作文の秒数の既定値と許容範囲。
 *
 * 既定を90秒とするのは、原案の60秒ではレベル1〜2が1文を組み立てきれない見込みであるためである。
 * 上限を150秒にするのは、2ラウンドで回すと1ゲームが約16分になり、
 * 収録計画の受入条件「6人で15分以内」を超えるためである（11の所要時間の見積り）。
 * step は入力の刻みであり、受理の条件にしない（範囲内の整数なら受理する）。
 */
export const WRITING_SECONDS = {
  default: 90,
  min: 60,
  max: 150,
  step: 30,
} as const;

// --- 表示文言とレベル差の吸収 ---

/**
 * レベル別に渡す hintEn の件数。
 *
 * 収録は3件以上とし、渡す件数だけを変える（11のレベル差の吸収の第1層）。
 * 質問は全員へ同じものを公開するため、難度の差をお題側に付けられない。
 */
export function hintCountFor(level: Level): number {
  return level <= 2 ? 3 : 1;
}

/** ステージごとの画面見出し。ホスト画面とタイマーバーで同じ文言を使う（基本設計/02） */
export const STAGE_LABELS_JA: Record<Stage, string> = {
  briefing: "質問の確認",
  writing: "英作文",
  guessing: "作者当て",
  judging: "答え合わせ",
  reveal: "開示",
};
