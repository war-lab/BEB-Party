// 乱数の再現性を固定する。ゲームモジュールのテストが同じseedで同じ結果を期待できる前提を守る
import { describe, expect, it } from "vitest";
import { createRandom, shuffle } from "./rng";

describe("createRandom", () => {
  it("同じseedから同じ列を返す", () => {
    const a = createRandom(12345);
    const b = createRandom(12345);
    const left = [a(), a(), a(), a(), a()];
    const right = [b(), b(), b(), b(), b()];
    expect(left).toEqual(right);
  });

  it("違うseedでは列が異なる", () => {
    const a = createRandom(1);
    const b = createRandom(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it("[0,1)の範囲に収まる", () => {
    const random = createRandom(777);
    for (let i = 0; i < 2000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

// 128bit の seed（ADR-0036）。実行時の乱数が 32bit に落ちること（総当たりで秘密が割れる）と、
// 数値の seed の出力が変わること（既存のテストの前提が崩れる）を検出する
describe("createRandom の128bit seed", () => {
  it("同じ128bit seedから同じ列を返し、1語違えば列が異なる", () => {
    const a = createRandom([1, 2, 3, 4]);
    const b = createRandom([1, 2, 3, 4]);
    const c = createRandom([1, 2, 3, 5]);
    const left = Array.from({ length: 8 }, () => a());
    expect(Array.from({ length: 8 }, () => b())).toEqual(left);
    expect(Array.from({ length: 8 }, () => c())).not.toEqual(left);
  });

  it("[0,1)の範囲に収まり、10区間に大きな偏りが無い", () => {
    const random = createRandom([0xdeadbeef, 0x12345678, 0x9abcdef0, 0x0badf00d]);
    const buckets = new Array<number>(10).fill(0);
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      buckets[Math.floor(value * 10)]! += 1;
    }
    for (const count of buckets) {
      expect(Math.abs(count - n / 10)).toBeLessThan(n / 10 * 0.1);
    }
  });

  it("4語のどれを変えても列が変わる（どの語も状態に効いている）", () => {
    const base = [11, 22, 33, 44] as const;
    const first = (seed: readonly [number, number, number, number]) => {
      const random = createRandom(seed);
      return Array.from({ length: 4 }, () => random());
    };
    const reference = first(base);
    for (let index = 0; index < 4; index += 1) {
      const changed = [...base] as [number, number, number, number];
      changed[index] = (changed[index] ?? 0) + 1;
      expect(first(changed)).not.toEqual(reference);
    }
  });

  it("数値のseedの出力は従来のmulberry32のまま変わらない", () => {
    const random = createRandom(1);
    expect(random()).toBe(0.6270739405881613);
    expect(random()).toBe(0.002735721180215478);
  });
});

describe("shuffle", () => {
  it("入力を破壊しない", () => {
    const source = [1, 2, 3, 4, 5];
    const copy = [...source];
    shuffle(source, createRandom(42));
    expect(source).toEqual(copy);
  });

  it("要素を落とさず並べ替える", () => {
    const source = ["a", "b", "c", "d", "e", "f"];
    const result = shuffle(source, createRandom(9));
    expect([...result].sort()).toEqual([...source].sort());
  });

  it("同じseedから同じ並びを返す", () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(source, createRandom(4))).toEqual(shuffle(source, createRandom(4)));
  });

  it("空配列と1要素でも落ちない", () => {
    expect(shuffle([], createRandom(1))).toEqual([]);
    expect(shuffle([9], createRandom(1))).toEqual([9]);
  });
});
