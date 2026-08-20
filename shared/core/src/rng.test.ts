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
