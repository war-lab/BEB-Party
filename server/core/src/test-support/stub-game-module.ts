// RoomDOのテスト専用スタブGameModule。ステージ2つだけを持ち、actionでのみ遷移する。
// 実際のゲームモジュールパッケージを一切importしない（基本設計/07、M0の完了条件）
import type { GameModule } from "@beb/shared-core";

export interface StubPublicState {
  stage: "stage1" | "stage2";
}

export interface StubSecret {
  hint: string;
}

export interface StubResult {
  outcome: "win" | "lose";
}

export const STUB_GAME_ID = "stub-game";

export const stubGameModule: GameModule<StubPublicState, StubSecret, StubResult> = {
  id: STUB_GAME_ID,
  title: "Stub Game",
  playerCount: [1, 8],

  listContents: () => [{ id: "stub-content", title: "Stub Content" }],

  validateSettings: (settings) => {
    if (settings === undefined) {
      return { valid: true };
    }
    if (typeof settings === "object" && settings !== null && "invalid" in settings) {
      return { valid: false, reason: "invalid settings for test" };
    }
    return { valid: true };
  },

  start: ({ players }) => {
    const secrets = new Map<string, StubSecret>();
    for (const player of players) {
      secrets.set(player.id, { hint: `secret-for-${player.id}` });
    }
    return {
      stage: "stage1",
      deadlineSeconds: 120,
      publicState: { stage: "stage1" },
      secrets,
    };
  },

  handleAction: ({ publicState, action }) => {
    if (action === "advance" && publicState.stage === "stage1") {
      return {
        publicState: { stage: "stage2" },
        stage: "stage2",
        deadlineSeconds: 90,
      };
    }
    if (action === "finish" && publicState.stage === "stage2") {
      return { result: { outcome: "win" } };
    }
    return { reject: { code: "invalid_action" } };
  },

  onDeadline: ({ publicState }) => {
    if (publicState.stage === "stage1") {
      return { publicState: { stage: "stage2" }, stage: "stage2", deadlineSeconds: 90 };
    }
    return { result: { outcome: "lose" } };
  },

  validateContent: () => ({ valid: true }),
};
