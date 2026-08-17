// GameModuleインターフェース。共通コアはこれだけを通してゲームに触る（基本設計/05_ゲームモジュール.md）
import type { ContentSummary, Player, Room } from "./types";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface GameTransition<TPublic, TResult, TGameSecret = unknown> {
  publicState?: TPublic;
  stage?: string;
  deadlineSeconds?: number;
  secrets?: Map<string, unknown>;
  // ゲームモジュールが呼び出しをまたいで保持する秘密状態。共通コアは中身を解釈せず、
  // storageのsecretsキーへ保存して次の呼び出しへ戻すだけとする（基本設計/01、ADR-0015）
  gameSecret?: TGameSecret;
  result?: TResult;
  reject?: { code: string };
}

export interface GameModule<TPublic, TSecret, TResult, TGameSecret = unknown> {
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
    gameSecret?: TGameSecret;
  };

  handleAction(input: {
    room: Room;
    publicState: TPublic;
    gameSecret: TGameSecret | undefined;
    playerId: string;
    action: string;
    payload: unknown;
  }): GameTransition<TPublic, TResult, TGameSecret>;

  onDeadline(input: {
    room: Room;
    publicState: TPublic;
    gameSecret: TGameSecret | undefined;
  }): GameTransition<TPublic, TResult, TGameSecret>;

  // CI用。ランタイムでは呼ばない
  validateContent(content: unknown): ValidationResult;
}
