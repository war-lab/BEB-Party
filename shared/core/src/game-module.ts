// GameModuleインターフェース。共通コアはこれだけを通してゲームに触る（基本設計/05_ゲームモジュール.md）
import type { ContentSummary, Player, Room } from "./types";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface GameTransition<TPublic, TResult> {
  publicState?: TPublic;
  stage?: string;
  deadlineSeconds?: number;
  secrets?: Map<string, unknown>;
  result?: TResult;
  reject?: { code: string };
}

export interface GameModule<TPublic, TSecret, TResult> {
  id: string;
  title: string;
  playerCount: [number, number];

  listContents(): ContentSummary[];

  validateSettings(settings: unknown): ValidationResult;

  start(input: { players: Player[]; contentId: string; settings: unknown; seed: number }): {
    stage: string;
    deadlineSeconds: number;
    publicState: TPublic;
    secrets: Map<string, TSecret>;
  };

  handleAction(input: {
    room: Room;
    publicState: TPublic;
    playerId: string;
    action: string;
    payload: unknown;
  }): GameTransition<TPublic, TResult>;

  onDeadline(input: { room: Room; publicState: TPublic }): GameTransition<TPublic, TResult>;

  // CI用。ランタイムでは呼ばない
  validateContent(content: unknown): ValidationResult;
}
