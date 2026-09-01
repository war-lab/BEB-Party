import type { Level } from "@beb/shared-core";
import { describe, expect, it } from "vitest";
import {
  ROUNDS,
  STAGES,
  STAGE_LABELS_JA,
  WRITING_SECONDS,
  hintCountFor,
  isFinalRound,
  pointsOf,
  type WhoWroteThisPublic,
} from "./game";

describe("hintCountFor", () => {
  it("レベル1〜2へ3件、レベル3以上へ1件を渡す（11のレベル差の吸収）", () => {
    const expected: Record<Level, number> = { 1: 3, 2: 3, 3: 1, 4: 1, 5: 1 };
    for (const [level, count] of Object.entries(expected)) {
      expect(hintCountFor(Number(level) as Level)).toBe(count);
    }
  });
});

describe("STAGE_LABELS_JA", () => {
  it("全ステージに見出しがある（ホスト画面とタイマーバーが同じ表を引く）", () => {
    for (const stage of Object.values(STAGES)) {
      expect(STAGE_LABELS_JA[stage]).toBeTruthy();
    }
  });
});

describe("WRITING_SECONDS", () => {
  it("既定値が範囲内にあり、stepの倍数である", () => {
    expect(WRITING_SECONDS.default).toBeGreaterThanOrEqual(WRITING_SECONDS.min);
    expect(WRITING_SECONDS.default).toBeLessThanOrEqual(WRITING_SECONDS.max);
    expect(WRITING_SECONDS.default % WRITING_SECONDS.step).toBe(0);
  });
});

describe("isFinalRound", () => {
  it("最終ラウンドだけ真になる", () => {
    const base = { totalRounds: ROUNDS } as WhoWroteThisPublic;
    expect(isFinalRound({ ...base, roundIndex: 0 })).toBe(false);
    expect(isFinalRound({ ...base, roundIndex: ROUNDS - 1 })).toBe(true);
  });
});

describe("pointsOf", () => {
  it("未登録のプレイヤーを0点として扱う", () => {
    expect(pointsOf([{ playerId: "p1", points: 3 }], "p1")).toBe(3);
    expect(pointsOf([{ playerId: "p1", points: 3 }], "p2")).toBe(0);
  });
});
