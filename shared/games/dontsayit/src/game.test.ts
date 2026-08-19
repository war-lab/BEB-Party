import { describe, expect, it } from "vitest";
import type { Level } from "@beb/shared-core";
import {
  MAX_CARD_ADVANCES_PER_ROUND,
  ROUND_SECONDS,
  TABOO_COUNT,
  advancesOf,
  hasConstraint,
  pointsOf,
  roleOf,
  speakerPlayerIdOf,
  tabooCountFor,
  watcherPlayerIdOf,
  type DontSayItPublic,
} from "./game";
import { MIN_CARDS, TABOO_PER_CARD } from "./set";

const LEVELS: Level[] = [1, 2, 3, 4, 5];

function publicStateWith(playerCount: number, roundIndex: number): DontSayItPublic {
  return {
    setId: "set_1",
    speakerOrder: Array.from({ length: playerCount }, (_, index) => `p${index + 1}`),
    roundIndex,
    readyPlayerIds: [],
    constraint: null,
    scores: [],
    rounds: [],
    solvedThisRound: 0,
    violatedThisRound: 0,
    skipUsedThisRound: false,
    roundSeconds: ROUND_SECONDS.default,
  };
}

describe("役の巡回", () => {
  // 09の3役: 監視役は次のラウンドの説明者とする
  it("監視役は次のラウンドの説明者である", () => {
    const state = publicStateWith(6, 0);
    expect(speakerPlayerIdOf(state)).toBe("p1");
    expect(watcherPlayerIdOf(state)).toBe("p2");
  });

  it("最終ラウンドの監視役は先頭へ折り返す", () => {
    const state = publicStateWith(6, 5);
    expect(speakerPlayerIdOf(state)).toBe("p6");
    expect(watcherPlayerIdOf(state)).toBe("p1");
  });

  it("6人で6ラウンド回すと全員が1回ずつ説明者と監視役を務める", () => {
    const speakers: string[] = [];
    const watchers: string[] = [];
    for (let roundIndex = 0; roundIndex < 6; roundIndex += 1) {
      const state = publicStateWith(6, roundIndex);
      speakers.push(speakerPlayerIdOf(state) as string);
      watchers.push(watcherPlayerIdOf(state) as string);
    }
    expect([...speakers].sort()).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect([...watchers].sort()).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
  });

  it("5人でも同じ巡回が成立する", () => {
    const watchers: string[] = [];
    for (let roundIndex = 0; roundIndex < 5; roundIndex += 1) {
      watchers.push(watcherPlayerIdOf(publicStateWith(5, roundIndex)) as string);
    }
    expect([...watchers].sort()).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("説明者と監視役以外は回答者になる", () => {
    const state = publicStateWith(6, 0);
    expect(roleOf(state, "p1")).toBe("speaker");
    expect(roleOf(state, "p2")).toBe("watcher");
    expect(roleOf(state, "p3")).toBe("answerer");
  });

  it("説明者の順が空でも例外を投げない", () => {
    const state = { ...publicStateWith(0, 0), speakerOrder: [] };
    expect(watcherPlayerIdOf(state)).toBeUndefined();
    expect(roleOf(state, "p1")).toBe("answerer");
  });
});

describe("レベル別の禁止語の提示数", () => {
  // 09のレベル差の吸収: 提示数だけを変え、収録数は5語固定とする
  it("提示数が収録数を超えない", () => {
    for (const level of LEVELS) {
      expect(tabooCountFor(level)).toBeLessThanOrEqual(TABOO_PER_CARD);
    }
  });

  it("レベルが上がるほど提示数が減らない", () => {
    for (let level = 2; level <= 5; level += 1) {
      expect(TABOO_COUNT[level as Level]).toBeGreaterThanOrEqual(TABOO_COUNT[(level - 1) as Level]);
    }
  });

  it("レベル1〜2は3語、レベル5は5語である", () => {
    expect(tabooCountFor(1)).toBe(3);
    expect(tabooCountFor(2)).toBe(3);
    expect(tabooCountFor(5)).toBe(TABOO_PER_CARD);
  });

  it("制約カードはレベル5にのみ配る", () => {
    expect(hasConstraint(5)).toBe(true);
    for (const level of [1, 2, 3, 4] as Level[]) {
      expect(hasConstraint(level)).toBe(false);
    }
  });
});

describe("1ラウンドの消費回数", () => {
  // 成立・違反・スキップのいずれもカードを1枚送るため、公開状態の3つの値から導ける
  it("成立と違反とスキップの合計を数える", () => {
    const state = { ...publicStateWith(6, 0), solvedThisRound: 2, violatedThisRound: 1, skipUsedThisRound: true };
    expect(advancesOf(state)).toBe(4);
  });

  it("スキップは1回だけ数える", () => {
    const state = { ...publicStateWith(6, 0), skipUsedThisRound: true };
    expect(advancesOf(state)).toBe(1);
  });

  it("山札の下限は上限に締切の1枚を足した枚数を人数分満たす", () => {
    // 締切時に表示中のカードも捨て札になるため、1ラウンドの最大消費は上限+1枚である
    expect(MIN_CARDS).toBeGreaterThanOrEqual(6 * (MAX_CARD_ADVANCES_PER_ROUND + 1));
  });
});

describe("公開状態", () => {
  // PR-1の受入条件2: お題語・禁止語を持つフィールドが公開状態に存在しない（ADR-0003）
  it("お題語と禁止語に相当するキーを持たない", () => {
    const keys = Object.keys(publicStateWith(6, 0));
    for (const forbidden of ["answer", "taboo", "card", "cards", "deck"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("制約カードは公開状態に持つ", () => {
    // 制約は秘密ではない。全員が見なければ遵守を判定できない（09の3役）。
    // 制約の文言は正解にも禁止語にも触れないため、公開しても秘密は漏れない
    expect(Object.keys(publicStateWith(6, 0))).toContain("constraint");
  });

  it("得点が未登録のプレイヤーは0点として読める", () => {
    expect(pointsOf([], "p1")).toBe(0);
    expect(pointsOf([{ playerId: "p1", points: 3 }], "p1")).toBe(3);
  });
});
