import { createRandom, type Level } from "@beb/shared-core";
import { describe, expect, it } from "vitest";
import {
  LOCK_SPECS,
  assignPieces,
  generateLock,
  generateLocks,
  kindsOf,
  solveFromPieces,
  usedSymbolsOf,
  type GeneratedLock,
  type Participant,
  type Piece,
} from "./lock";
import { RULE_TARGET, SKIP_RULE_IDS, computeCode, type RuleSpec } from "./rules";

// 生成の不変条件を多数のseedで固定する（13の生成、ADR-0027）。
// 1件の反例がそのまま「解けない錠」「答えが複数ある錠」「1人欠けても解ける錠」になるため、件数を多めに取る
const SEED_COUNT = 1000;

const noText = (rule: RuleSpec) => ({ textEn: rule.ruleId });

function participantsOf(levels: readonly number[]): Participant[] {
  return levels.map((level, index) => ({ id: `p${index + 1}`, level: level as Level }));
}

const LEVEL_SETS: Record<number, number[][]> = {
  2: [
    [1, 5],
    [3, 3],
  ],
  3: [
    [1, 3, 5],
    [2, 2, 2],
  ],
  4: [
    [1, 2, 4, 5],
    [3, 3, 3, 3],
  ],
};

function mapOf(lock: GeneratedLock): Map<string, string> {
  return new Map(lock.map.map((entry) => [entry.symbol, entry.digit]));
}

describe("generateLock", () => {
  it("同じseedから同じ錠が得られる（決定性）", () => {
    expect(generateLocks(createRandom(7))).toEqual(generateLocks(createRandom(7)));
  });

  // 以下は13の生成に挙げた不変条件。1つでも破れると、遊べない錠が本番に出る
  it("答えの桁数・重複・対応表の網羅・並びに無い記号の数が錠の定義どおりになる", () => {
    for (let seed = 0; seed < SEED_COUNT; seed += 1) {
      const locks = generateLocks(createRandom(seed));
      locks.forEach((lock, index) => {
        const spec = LOCK_SPECS[index]!;
        expect(lock.code).toHaveLength(spec.codeLength);
        expect(new Set(lock.order).size).toBe(lock.order.length);
        const digits = lock.map.map((entry) => entry.digit);
        expect(new Set(digits).size).toBe(digits.length);
        const mapped = new Set(lock.map.map((entry) => entry.symbol));
        for (const symbol of usedSymbolsOf(lock)) {
          expect(mapped.has(symbol)).toBe(true);
        }
        const extra = lock.map.filter((entry) => !lock.order.includes(entry.symbol)).length;
        expect(extra).toBeGreaterThanOrEqual(spec.minExtraSymbols);
        expect(lock.rules).toHaveLength(spec.ruleCount);
        expect(computeCode(lock.order, lock.rules, mapOf(lock) as never)).toBe(lock.code);
      });
    }
  });

  it("錠3の規則は除く規則が1つまでで、同じ規則IDが重ならず、記号の規則が前に並ぶ", () => {
    for (let seed = 0; seed < SEED_COUNT; seed += 1) {
      const lock = generateLock(LOCK_SPECS[2]!, createRandom(seed));
      const ids = lock.rules.map((rule) => rule.ruleId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.filter((id) => SKIP_RULE_IDS.includes(id)).length).toBeLessThanOrEqual(1);
      const targets = lock.rules.map((rule) => RULE_TARGET[rule.ruleId]);
      expect([...targets].sort((a, b) => (a === "symbol" ? 0 : 1) - (b === "symbol" ? 0 : 1))).toEqual(targets);
    }
  });

  // 規則を持つ人の情報を欠くと答えが決まらないことの根拠（13の規則）
  it("規則を1つずつ外すと答えが変わる", () => {
    for (let seed = 0; seed < SEED_COUNT; seed += 1) {
      for (const lock of generateLocks(createRandom(seed))) {
        lock.rules.forEach((_, removed) => {
          const without = lock.rules.filter((__, index) => index !== removed);
          expect(computeCode(lock.order, without, mapOf(lock) as never)).not.toBe(lock.code);
        });
      }
    }
  });
});

describe("assignPieces", () => {
  function assignAll(seed: number, levels: readonly number[]): { locks: GeneratedLock[]; assigned: Record<string, Piece[]>[] } {
    const random = createRandom(seed);
    const locks = generateLocks(random);
    const participants = participantsOf(levels);
    const assigned = locks.map((lock, index) => assignPieces(lock, index, participants, random, noText));
    return { locks, assigned };
  }

  // 全員の断片で解け、誰か1人の断片を欠くと解けない。これが崩れると協力の必然が消える（13の生成）
  it("全員の断片で答えが出て、どの参加者の断片を外しても答えが出ない", () => {
    for (const count of [2, 3, 4]) {
      for (const levels of LEVEL_SETS[count]!) {
        for (let seed = 0; seed < SEED_COUNT; seed += 1) {
          const { locks, assigned } = assignAll(seed, levels);
          locks.forEach((lock, index) => {
            const byPlayer = assigned[index]!;
            const all = Object.values(byPlayer).flat();
            expect(solveFromPieces(all, index)).toBe(lock.code);
            for (const playerId of Object.keys(byPlayer)) {
              const others = Object.entries(byPlayer)
                .filter(([id]) => id !== playerId)
                .flatMap(([, pieces]) => pieces);
              expect(solveFromPieces(others, index)).toBeUndefined();
            }
          });
        }
      }
    }
  });

  it("どの錠でも全員が1つ以上の断片を持つ", () => {
    for (const count of [2, 3, 4]) {
      const { assigned } = assignAll(1, LEVEL_SETS[count]![0]!);
      for (const byPlayer of assigned) {
        expect(Object.keys(byPlayer)).toHaveLength(count);
        for (const pieces of Object.values(byPlayer)) {
          expect(pieces.length).toBeGreaterThan(0);
        }
      }
    }
  });

  // レベル差の吸収の第1層。規則は最も高いレベル、対応表は最も低いレベルへ渡る
  it("規則がレベルの最も高い人に、対応表がレベルの最も低い人に渡る", () => {
    for (const count of [2, 3, 4]) {
      for (let seed = 0; seed < 50; seed += 1) {
        const levels = LEVEL_SETS[count]![0]!;
        const { assigned } = assignAll(seed, levels);
        const top = `p${levels.indexOf(Math.max(...levels)) + 1}`;
        const bottom = `p${levels.indexOf(Math.min(...levels)) + 1}`;
        for (const index of [1, 2]) {
          expect(kindsOf(assigned[index]![top]!)).toContain("rule");
          expect(kindsOf(assigned[index]![bottom]!)).toEqual(["map"]);
        }
      }
    }
  });

  it("全員が同じレベルのとき、錠ごとに規則を持つ人が変わりうる", () => {
    const holders = new Set<string>();
    for (let seed = 0; seed < 50; seed += 1) {
      const { assigned } = assignAll(seed, [3, 3, 3]);
      for (const index of [1, 2]) {
        const holder = Object.entries(assigned[index]!).find(([, pieces]) => kindsOf(pieces).includes("rule"));
        holders.add(holder![0]);
      }
    }
    expect(holders.size).toBeGreaterThan(1);
  });

  it("対応表を半分に分けたとき、どちらにも答えに使う記号が入る", () => {
    for (let seed = 0; seed < SEED_COUNT; seed += 1) {
      const { locks, assigned } = assignAll(seed, [3, 3, 3, 3]);
      locks.forEach((lock, index) => {
        const used = new Set(usedSymbolsOf(lock));
        const halves = Object.values(assigned[index]!)
          .flat()
          .filter((piece) => piece.kind === "map" && piece.part !== "whole");
        expect(halves).toHaveLength(2);
        for (const half of halves) {
          if (half.kind === "map") {
            expect(half.entries.some((entry) => used.has(entry.symbol))).toBe(true);
          }
        }
      });
    }
  });
});
