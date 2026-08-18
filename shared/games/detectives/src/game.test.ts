import { describe, expect, it } from "vitest";
import type { Level } from "@beb/shared-core";
import { CONSTRAINTS, INVESTIGATION_SECONDS, QUESTION_TEMPLATES, questionTemplatesFor } from "./game";

const LEVELS: Level[] = [1, 2, 3, 4, 5];

describe("レベル別の制約", () => {
  // 受入条件5: レベル1〜2を例外にすると日本語ヒントだけで済ませられる（基本設計/02の不変条件）
  it("全レベルに「証言は英語で読み上げる」が含まれる", () => {
    for (const level of LEVELS) {
      expect(CONSTRAINTS[level]).toContain("証言は英語で読み上げる");
    }
  });

  it("レベルが上がるほど制約が減らない", () => {
    for (let level = 2; level <= 5; level += 1) {
      expect(CONSTRAINTS[level as Level].length).toBeGreaterThanOrEqual(CONSTRAINTS[(level - 1) as Level].length);
    }
  });

  it("レベル5だけが断定表現の禁止を持つ", () => {
    expect(CONSTRAINTS[5]).toContain("断定表現を使わない");
    for (const level of [1, 2, 3, 4] as Level[]) {
      expect(CONSTRAINTS[level]).not.toContain("断定表現を使わない");
    }
  });
});

describe("質問テンプレート", () => {
  it("レベル1〜2にのみ渡す", () => {
    expect(questionTemplatesFor(1)).toEqual(QUESTION_TEMPLATES);
    expect(questionTemplatesFor(2)).toEqual(QUESTION_TEMPLATES);
    expect(questionTemplatesFor(3)).toBeUndefined();
    expect(questionTemplatesFor(5)).toBeUndefined();
  });

  it("定数そのものを渡さない（受け手の変更が定数へ波及しない）", () => {
    const templates = questionTemplatesFor(1);
    templates?.push("Extra?");
    expect(QUESTION_TEMPLATES).toHaveLength(4);
  });
});

describe("捜査時間", () => {
  it("既定値が許容範囲に収まる", () => {
    expect(INVESTIGATION_SECONDS.min).toBeLessThanOrEqual(INVESTIGATION_SECONDS.default);
    expect(INVESTIGATION_SECONDS.default).toBeLessThanOrEqual(INVESTIGATION_SECONDS.max);
  });
});
