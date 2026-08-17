import { describe, expect, it } from "vitest";
import { EngineError, explain, isRequired, saturate, type Rule } from "./index";

// 多段の推論を含む規則集合。r3のrequiresはr1・r2のyieldsであり、事実まで2段辿る必要がある
const multiStepRules: Rule[] = [
  { id: "r1", requires: ["a1", "a2"], yields: "m1" },
  { id: "r2", requires: ["b1", "b2"], yields: "m2" },
  { id: "r3", requires: ["m1", "m2"], yields: "goal" },
];

const multiStepInitial = new Set(["a1", "a2", "b1", "b2"]);

describe("saturate", () => {
  // 受入条件1: 規則の並び順を変えても到達集合が変わらない（不動点）
  it("規則の並び順を変えても同じ到達集合になる", () => {
    const orderings: Rule[][] = [
      [...multiStepRules],
      [multiStepRules[2]!, multiStepRules[0]!, multiStepRules[1]!],
      [multiStepRules[1]!, multiStepRules[2]!, multiStepRules[0]!],
      [...multiStepRules].reverse(),
    ];

    const results = orderings.map((rules) => [...saturate(multiStepInitial, rules).reached].sort());

    for (const reached of results) {
      expect(reached).toEqual(["a1", "a2", "b1", "b2", "goal", "m1", "m2"]);
    }
  });

  it("firedに発火した規則のidがすべて含まれる", () => {
    const { fired } = saturate(multiStepInitial, multiStepRules);
    expect([...fired].sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("requiresが満たされない規則は発火しない", () => {
    const { reached, fired } = saturate(new Set(["a1", "a2"]), multiStepRules);
    expect(reached.has("goal")).toBe(false);
    expect(fired).toEqual(["r1"]);
  });

  it("initialのシンボルをそのまま到達集合に含める", () => {
    const { reached } = saturate(new Set(["x"]), []);
    expect([...reached]).toEqual(["x"]);
  });

  // 受入条件2: 自己参照規則で停止し、検証エラーになる
  it("yieldsが自身のrequiresに含まれる規則を与えるとエラーになる", () => {
    const selfReferencing: Rule[] = [{ id: "r_self", requires: ["a1", "loop"], yields: "loop" }];
    expect(() => saturate(new Set(["a1", "loop"]), selfReferencing)).toThrow(EngineError);
    expect(() => saturate(new Set(["a1", "loop"]), selfReferencing)).toThrow(/自己参照/);
  });

  it("シンボル数が多い入力でも停止する", () => {
    // 連鎖する規則を100本並べる。反復上限（規則数）に達しないことの確認も兼ねる
    const chain: Rule[] = Array.from({ length: 100 }, (_, index) => ({
      id: `c${index}`,
      requires: [`s${index}`],
      yields: `s${index + 1}`,
    }));
    const { reached } = saturate(new Set(["s0"]), chain);
    expect(reached.has("s100")).toBe(true);
    expect(reached.size).toBe(101);
  });
});

describe("isRequired", () => {
  // 受入条件3: 単一経路なら必須と判定される
  it("経路が1本のとき、その事実は必須と判定される", () => {
    expect(isRequired(multiStepInitial, multiStepRules, "goal", ["a1"])).toBe(true);
    expect(isRequired(multiStepInitial, multiStepRules, "goal", ["b2"])).toBe(true);
  });

  // 受入条件4: 経路が2本あるなら不要と判定される
  it("経路が2本あるとき、片方の事実は不要と判定される", () => {
    const twoPathRules: Rule[] = [
      ...multiStepRules,
      { id: "r4", requires: ["a3"], yields: "m1" },
    ];
    const initial = new Set([...multiStepInitial, "a3"]);
    expect(isRequired(initial, twoPathRules, "goal", ["a1"])).toBe(false);
    expect(isRequired(initial, twoPathRules, "goal", ["a3"])).toBe(false);
    // 両方の経路を同時に断てば必須になる
    expect(isRequired(initial, twoPathRules, "goal", ["a1", "a3"])).toBe(true);
  });

  it("dropに存在しないシンボルを渡しても結果が変わらない", () => {
    expect(isRequired(multiStepInitial, multiStepRules, "goal", ["unknown"])).toBe(false);
  });
});

describe("explain", () => {
  // 受入条件5: supportから到達シンボルの導出元を辿ると規則idが得られる
  it("到達シンボルから導出に使った規則idと末端の事実を辿れる", () => {
    const saturation = saturate(multiStepInitial, multiStepRules);
    expect(saturation.support.get("goal")).toEqual(["m1", "m2"]);

    const derivation = explain(saturation, multiStepRules, "goal");
    expect(derivation.ruleIds).toEqual(["r1", "r2", "r3"]);
    expect(derivation.leaves).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("同じシンボルを導く規則が複数発火した場合、そのすべてを導出元として返す", () => {
    const rules: Rule[] = [
      { id: "r1", requires: ["a1"], yields: "m1" },
      { id: "r2", requires: ["b1"], yields: "m1" },
    ];
    const saturation = saturate(new Set(["a1", "b1"]), rules);
    const derivation = explain(saturation, rules, "m1");
    expect(derivation.ruleIds).toEqual(["r1", "r2"]);
    expect(derivation.leaves).toEqual(["a1", "b1"]);
  });

  it("initial由来のシンボルは末端として返る", () => {
    const saturation = saturate(multiStepInitial, multiStepRules);
    expect(explain(saturation, multiStepRules, "a1")).toEqual({ ruleIds: [], leaves: ["a1"] });
  });

  it("到達していないシンボルは末端にも規則にも現れない", () => {
    const saturation = saturate(new Set(["a1"]), multiStepRules);
    expect(explain(saturation, multiStepRules, "goal")).toEqual({ ruleIds: [], leaves: [] });
  });
});
