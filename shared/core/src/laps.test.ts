// 周回数の選択肢の受理と既定への落とし方を固定する。3本のゲームが同じ受理範囲を前提にしている
import { describe, expect, it } from "vitest";
import { LAPS_IDS, LAPS_OPTIONS, MAX_LAPS, isLapsId, lapsFromId } from "./laps";

describe("周回数の選択肢", () => {
  it("選択肢は1周と2周で、上限は2周である", () => {
    expect(LAPS_IDS).toEqual(["1", "2"]);
    expect(LAPS_OPTIONS["1"].laps).toBe(1);
    expect(LAPS_OPTIONS["2"].laps).toBe(2);
    expect(MAX_LAPS).toBe(2);
  });

  it("文字列のidだけを受理する", () => {
    expect(isLapsId("1")).toBe(true);
    expect(isLapsId("2")).toBe(true);
    expect(isLapsId("3")).toBe(false);
    expect(isLapsId(2)).toBe(false);
    expect(isLapsId(undefined)).toBe(false);
    // プロトタイプの欄を選択肢として受理しない
    expect(isLapsId("toString")).toBe(false);
  });

  it("未知の値は呼び出し側が渡した既定へ落とす", () => {
    expect(lapsFromId("2", "1")).toBe(2);
    expect(lapsFromId("9", "1")).toBe(1);
    expect(lapsFromId(undefined, "2")).toBe(2);
  });
});
