// TWO-HEADED SPEAKERのランタイム型と表示文言の定数（基本設計/16_TWOHEADEDゲームモジュール.md）。
//
// 公開状態・秘密情報・結果を別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
// 終えていないお題（answer / ja / aliases）と山札の残り枚数は、秘密情報とゲーム秘密状態の側にだけ現れる。
import { MAX_LAPS, lapsFromId, type ContentSummary, type LapsId } from "@beb/shared-core";
import type { KeyExpression } from "./set";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  /** 遊び方・ペア・規則の確認 */
  briefing: "briefing",
  /** 説明役のペアが1枚目を読み、話す順を確かめる時間。explaining の持ち時間の外に置く（16のステージ） */
  handoff: "handoff",
  /** 説明役のペアが1語ずつ交互に話してお題を説明する */
  explaining: "explaining",
  /** 結果。遷移しない */
  debrief: "debrief",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** ロビーで変更できないステージの締切秒数。explaining だけが turnSeconds で決まる（16のステージ） */
export const STAGE_DEADLINE_SECONDS = {
  briefing: 90,
  handoff: 30,
} as const;

/**
 * 1手番でお題を次へ送れる回数の上限（16のステージ）。
 *
 * 正解と送りの合計に課し、上限に達した時点でその手番を終える。
 * 上限がないと、送りを連打して山札を掘り尽くし、残りのペアが説明役を務められないままゲームが終わる。
 */
export const MAX_CARDS_PER_TURN = 5;

/**
 * 人数ごとのペアの人数構成（16の「ペアの編成と奇数人数」）。
 *
 * 7人のときだけ1組を3人組にする。対応人数は6〜8人である（16の「対応人数の下限を6人にする理由」）。
 */
export const TEAM_SIZES: Readonly<Record<number, readonly number[]>> = {
  6: [2, 2, 2],
  7: [2, 2, 3],
  8: [2, 2, 2, 2],
};

/** ペアの数の上限。山札の下限（MIN_CARDS）はこの値から導く */
export const MAX_TEAMS = Math.max(...Object.values(TEAM_SIZES).map((sizes) => sizes.length));

/**
 * 山札の下限（16の検証4）。
 *
 * 1手番の消費上限 × ペアの数の上限 × 周回数の上限（5 × 4 × 2 = 40）。
 * 下限を下回ると、最後のペアに説明役が回らない山札が検証を通る。
 */
export const MIN_CARDS = MAX_CARDS_PER_TURN * MAX_TEAMS * MAX_LAPS;

/** お題セットの公開メタ情報。お題を含めない（16のカタログ） */
export interface TwoHeadedSetSummary extends ContentSummary {
  cardCount: number;
}

// --- 公開状態 ---

export interface TeamPublic {
  /** "t1"〜"t4"。start で編成した順に振る */
  teamId: string;
  /** playerId。話す順の元になる並び。ゲーム中は変えない（16の「話す順の決め方」） */
  members: string[];
}

export interface TeamScore {
  teamId: string;
  points: number;
}

export interface TurnSummary {
  teamId: string;
  solved: number;
  passed: number;
  /** 説明役のペアの未接続で手番を飛ばした */
  skipped: boolean;
}

export type CardOutcome = "solved" | "passed";

/** 直前に正解か送りで終えたお題。終えたお題は説明が済んでおり、公開しても当てる側の得にならない（16の公開状態） */
export interface RevealedCard {
  answer: string;
  ja: string;
  outcome: CardOutcome;
  /** solved のときだけ入る */
  guessedTeamId: string | null;
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * 終えていないお題と山札の残り枚数を含めない（ADR-0003、16の公開状態）。
 */
export interface TwoHeadedPublic {
  setId: string;
  /** start で編成した順 */
  teams: TeamPublic[];
  /** 説明役の teamId の列。周回数ぶん繰り返す */
  turnOrder: string[];
  /** 0始まり。debrief では最後の手番のまま */
  turnIndex: number;
  /** briefing の収集状況 */
  readyPlayerIds: string[];
  /**
   * 現在のお題で話す順（playerId）。先頭が最初に話す人。handoff と explaining で使い、それ以外は空にする。
   * 当てる側も話す順を知っていないと、交互の違反を指摘できない（16の公開状態）
   */
  speakingOrder: string[];
  /** teams の順 */
  scores: TeamScore[];
  /** 終了した手番の記録 */
  turns: TurnSummary[];
  solvedThisTurn: number;
  passedThisTurn: number;
  /** 直前に終えたお題。手番が変わると null に戻す */
  lastCard: RevealedCard | null;
  /**
   * 説明の書き出しの例。説明役のペアの画面に出す（16のレベル差の吸収）。
   * お題ではなく、伏せる理由がない。秘密情報に入れると役が変わるたびに送り直す量が増える
   */
  starters: KeyExpression[];
  /** 確定した1手番の秒数。handleAction に Room の settings が渡らないため公開状態に持つ */
  turnSeconds: number;
  laps: number;
}

/** 現在の説明役のペア。turnOrder と turnIndex から導く */
export function explainerTeamIdOf(publicState: Pick<TwoHeadedPublic, "turnOrder" | "turnIndex">): string | undefined {
  return publicState.turnOrder[publicState.turnIndex];
}

export function teamOf(teams: readonly TeamPublic[], teamId: string | undefined): TeamPublic | undefined {
  return teams.find((team) => team.teamId === teamId);
}

/** そのプレイヤーのペア。参加者でなければ undefined */
export function teamOfPlayer(teams: readonly TeamPublic[], playerId: string | null | undefined): TeamPublic | undefined {
  return playerId === null || playerId === undefined ? undefined : teams.find((team) => team.members.includes(playerId));
}

/** そのプレイヤーが現在の説明役のペアの一員か */
export function isExplainer(publicState: TwoHeadedPublic, playerId: string | null | undefined): boolean {
  const team = teamOf(publicState.teams, explainerTeamIdOf(publicState));
  return team !== undefined && playerId !== null && playerId !== undefined && team.members.includes(playerId);
}

/** その手番でお題を次へ送った回数。正解と送りの合計（16のステージの消費上限） */
export function advancesOf(publicState: Pick<TwoHeadedPublic, "solvedThisTurn" | "passedThisTurn">): number {
  return publicState.solvedThisTurn + publicState.passedThisTurn;
}

/**
 * 話す順（16の「話す順の決め方」）。
 *
 * そのペアがゲームの中で説明したお題の通し番号を、ペアの人数で割った余りだけ並びをずらす。
 * 2人のペアではお題ごとに先に話す人が入れ替わり、3人組では A→B→C、B→C→A、C→A→B の順で回る。
 */
export function speakingOrderOf(members: readonly string[], explainedCount: number): string[] {
  if (members.length === 0) {
    return [];
  }
  const shift = ((explainedCount % members.length) + members.length) % members.length;
  return [...members.slice(shift), ...members.slice(0, shift)];
}

/** ペアの表示名。編成の並び順に「ペア1」から振る */
export function pairLabelOf(teams: readonly TeamPublic[], teamId: string | null | undefined): string {
  const index = teams.findIndex((team) => team.teamId === teamId);
  return index < 0 ? "" : `ペア${index + 1}`;
}

/**
 * 順位。点の高い順に1から振り、同点は同じ順位にする（16の得点「同点の扱いは決めず、同じ順位として表示する」）。
 */
export function placesOf(scores: readonly TeamScore[]): Map<string, number> {
  const places = new Map<string, number>();
  for (const score of scores) {
    places.set(score.teamId, 1 + scores.filter((other) => other.points > score.points).length);
  }
  return places;
}

// --- 秘密情報 ---

/**
 * 説明役のペアの全員に同じお題を送る。2人が同じお題を見ていないと、相方の語の意図を読めない（16の秘密情報）。
 *
 * `ja` を含めるのは、英語名を見てお題を認識できない説明役を救うためである。
 */
export interface ExplainerSecret {
  role: "explainer";
  card: {
    cardId: string;
    answer: string;
    ja: string;
    aliases: string[];
  };
}

/** 当てる側に配る。内容を持たない。当てる側の端末にお題が届かないことを型で示す */
export interface GuesserSecret {
  role: "guesser";
}

export type TwoHeadedSecret = ExplainerSecret | GuesserSecret;

// --- 結果 ---

export interface UsedCardResult {
  answer: string;
  ja: string;
  /** 説明したペア */
  teamId: string;
  outcome: "solved" | "passed" | "timeout";
  guessedTeamId: string | null;
}

/**
 * 結果。finished のまま再接続した人へ共通コアが lastResult を再送するため、
 * ペアの構成を載せて公開状態に依存しないようにする（16の結果）。
 */
export interface TwoHeadedResult {
  teams: TeamPublic[];
  /** points 降順 */
  scores: TeamScore[];
  turns: TurnSummary[];
  /** 正解・送り・時間切れのお題。説明していないお題（飛ばした手番のお題）は含めない */
  usedCards: UsedCardResult[];
  keyExpressions: KeyExpression[];
}

// --- action ---

export const ACTIONS = {
  /** briefing の進行合意 */
  ready: "ready",
  /** 説明役のペアの1人が持ち時間を開始する */
  startTurn: "startTurn",
  /** 説明役のペアが、最初に当てたペアを申告する */
  claimCorrect: "claimCorrect",
  /** 説明役のペアがお題を送る。言えない語を言ったときと、知らないお題を飛ばすときに使う */
  passCard: "passCard",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

/** claimCorrect のペイロード */
export interface ClaimCorrectPayload {
  /** 表示中のお題。画面が1枚遅れている状態からの申告を弾くために送る */
  cardId: string;
  /** 当てたペア */
  teamId: string;
}

/** passCard のペイロード */
export interface PassCardPayload {
  cardId: string;
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、16）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  /** 送信者が説明役のペアの一員でない */
  notExplainer: "not_explainer",
  /** teamId が説明役のペア自身か、存在しないペア */
  invalidTarget: "invalid_target",
  /** 表示中でないお題への操作 */
  staleCard: "stale_card",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// --- 設定 ---

export interface TwoHeadedSettings {
  turnSeconds: number;
  laps: number;
}

/**
 * 1手番の説明時間の既定値と許容範囲（16の設定）。
 *
 * 下限60秒は、1語ずつの説明では1枚に時間がかかり、60秒未満では1枚も当たらない手番が増える見込みのため。
 * 上限120秒は、8人で2周の所要時間が20分を超えるため。step は入力の刻みであり、受理の条件にしない。
 */
export const TURN_SECONDS = {
  default: 90,
  min: 60,
  max: 120,
  step: 15,
} as const;

/**
 * 周回数の既定。選択肢は共通コアにある（ADR-0020）。
 *
 * 1周ではペアが説明役を1回しか務めないため、既定を2周とする（16の設定）。
 */
export const DEFAULT_LAPS_ID: LapsId = "2";

/** 周回数を引く。未知の値は既定へ落として進行を止めない */
export function lapsOf(id: unknown): number {
  return lapsFromId(id, DEFAULT_LAPS_ID);
}

// --- 表示文言の定数 ---

/** ステージごとの画面見出し。ホスト画面とタイマーバーで同じ文言を使う（基本設計/02） */
export const STAGE_LABELS_JA: Record<Stage, string> = {
  briefing: "遊び方の確認",
  handoff: "交代",
  explaining: "説明タイム",
  debrief: "結果",
};

/**
 * 当てる側の画面に出す言い回し。
 *
 * セットごとに変わらないためコンテンツに持たせない（16の画面、09の「表示文言の定数」と同じ判断）。
 */
export const GUESSER_PROMPTS = ["Is it a ...?", "Say it again, please.", "One more word!"];
