// DETECTIVESのランタイム型と表示文言の定数（基本設計/08_DETECTIVESゲームモジュール.md、設計.md）。
// 公開状態と秘密情報は別の型で表す。同じ型に混ぜると、片方だけを配るコードが書けなくなる（ADR-0003）。
import type { ContentSummary, Level } from "@beb/shared-core";
import type { Disclosure } from "./case";

/** ステージid。共通コアはこの文字列を解釈しない（ADR-0009） */
export const STAGES = {
  briefing: "briefing",
  investigation: "investigation",
  voting: "voting",
  reveal: "reveal",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];

/** ステージの既定の締切秒数。捜査だけがロビーで変更できる（設計.md） */
export const STAGE_DEADLINE_SECONDS = {
  briefing: 120,
  voting: 90,
} as const;

/** 事件の公開メタ情報。ContentSummaryの実装（設計.md） */
export interface CaseSummary extends ContentSummary {
  playerCount: [number, number];
  briefingJa: string;
}

// --- 秘密情報 ---

/** 本人にだけ配られる証言カード。1枚が1つのfactに対応する */
export interface TestimonyCard {
  factId: string;
  /** 配役されたプレイヤーのレベルの英文 */
  textEn: string;
  hintJa: string;
  disclosure: Disclosure;
  /** 犯人へ渡る差し替え済みのカードだけが真になる */
  isLie: boolean;
}

export interface DetectivesSecret {
  characterId: string;
  isCulprit: boolean;
  cards: TestimonyCard[];
  /** レベル別の制約の表示文言 */
  constraints: string[];
  /** レベル1〜2にのみ付く */
  questionTemplates?: string[];
}

// --- 公開状態 ---

export interface CastEntry {
  playerId: string;
  characterId: string;
  characterName: string;
}

/**
 * 全員へブロードキャストされる公開状態。
 *
 * 犯人フラグ・証言テキスト・投票先を含めない（ADR-0003）。
 * 誰が投票を終えたかは進行の表示に要るが、投票先はrevealまで秘密である。
 */
export interface DetectivesPublic {
  caseId: string;
  briefing: { ja: string; en: string };
  cast: CastEntry[];
  readyPlayerIds: string[];
  votedPlayerIds: string[];
}

// --- 結果 ---

export interface ContradictionExplanation {
  meaningJa: string;
  supportingCards: { characterName: string; textEn: string }[];
}

export interface DetectivesResult {
  culprit: { playerId: string; characterId: string };
  lieCard: { textEn: string; hintJa: string };
  contradictions: ContradictionExplanation[];
  votes: { voterPlayerId: string; targetPlayerId: string }[];
  outcome: "citizens" | "culprit";
  timelineEn: string[];
  keyExpressions: { en: string; ja: string }[];
}

// --- action ---

export const ACTIONS = {
  ready: "ready",
  vote: "vote",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

/** vote のペイロード。ready はペイロードを持たない */
export interface VotePayload {
  targetPlayerId: string;
}

/**
 * ゲーム固有のエラーコード。共通コアのエラーコード表には含めず、
 * GameTransition.reject で返す（基本設計/01、08）
 */
export const ERROR_CODES = {
  invalidStage: "invalid_stage",
  invalidTarget: "invalid_target",
  alreadyVoted: "already_voted",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// --- 設定 ---

export interface DetectivesSettings {
  investigationSeconds: number;
}

/**
 * 捜査時間の既定値と許容範囲。
 *
 * 範囲の根拠はゲームバランスであり、共通コアではなくこのモジュールが持つ（ADR-0012）。
 * 下限を300秒にするのは、6人が英語で質問し合うには5分未満では足りないためである。
 * 上限を1200秒にするのは、これを超えると会話が尽きて待ち時間になるためである。
 */
export const INVESTIGATION_SECONDS = {
  default: 600,
  min: 300,
  max: 1200,
} as const;

// --- 表示文言の定数（08の表） ---

const READ_IN_ENGLISH = "証言は英語で読み上げる";
const NO_JAPANESE = "日本語での補足は禁止";

/**
 * レベル別の制約。
 *
 * 全レベルに「証言は英語で読み上げる」を含める。
 * レベル1〜2を例外にすると、日本語ヒントだけで済ませられる（基本設計/02の不変条件）。
 */
export const CONSTRAINTS: Record<Level, string[]> = {
  1: [READ_IN_ENGLISH],
  2: [READ_IN_ENGLISH],
  3: [READ_IN_ENGLISH, NO_JAPANESE],
  4: [READ_IN_ENGLISH, NO_JAPANESE, "聞かれた内容にしか答えられないカードがある"],
  5: [READ_IN_ENGLISH, NO_JAPANESE, "断定表現を使わない", "聞かれた内容にしか答えられない"],
};

/** レベル1〜2にのみ渡す質問テンプレート（構想v2） */
export const QUESTION_TEMPLATES = [
  "Where were you?",
  "What did you see?",
  "Who were you with?",
  "Are you sure?",
];

/** そのレベルに質問テンプレートを渡すか */
export function questionTemplatesFor(level: Level): string[] | undefined {
  return level <= 2 ? [...QUESTION_TEMPLATES] : undefined;
}
