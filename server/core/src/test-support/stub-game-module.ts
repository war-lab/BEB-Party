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
  // 秘密状態が呼び出しをまたいで戻ってきたかを結果に載せて観測する（ADR-0015の退行検知）
  advanceCount?: number;
}

// ゲームモジュールが保持する秘密状態。共通コアは中身を解釈せず預かるだけである
export interface StubGameSecret {
  advanceCount: number;
}

export const STUB_GAME_ID = "stub-game";
export const STUB_CONTENT_ID = "stub-content";

export const stubGameModule: GameModule<StubPublicState, StubSecret, StubResult, StubGameSecret> = {
  title: "Stub Game",
  tagline: "テスト用のスタブ",
  icon: "🧪",
  contentLabelJa: "コンテンツを選ぶ",
  settingsFields: [],
  playerCount: [1, 8],

  listContents: () => [{ id: STUB_CONTENT_ID, title: "Stub Content" }],

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
      gameSecret: { advanceCount: 0 },
    };
  },

  handleAction: ({ publicState, gameSecret, action }) => {
    if (action === "advance" && publicState.stage === "stage1") {
      return {
        publicState: { stage: "stage2" },
        stage: "stage2",
        deadlineSeconds: 90,
        gameSecret: { advanceCount: (gameSecret?.advanceCount ?? 0) + 1 },
      };
    }
    if (action === "finish" && publicState.stage === "stage2") {
      return { result: { outcome: "win", advanceCount: gameSecret?.advanceCount ?? 0 } };
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
