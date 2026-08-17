import { describe, expect, it } from "vitest";
import { derive5p, has5p, mergedAwayIds } from "./derive-5p";
import { contradiction, mergeGapCase, validCase } from "./test-support/fixtures";

describe("derive5p", () => {
  it("手順1: 統合されるキャラクターが一覧から消える", () => {
    const derived = derive5p(validCase());
    expect(derived.characters.map((character) => character.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("手順2: 統合されたキャラクターの事実のownerが付け替わる。idとvalueは変えない", () => {
    const base = validCase();
    const derived = derive5p(base);
    const f6 = derived.facts.find((entry) => entry.id === "f6");
    expect(f6?.owner).toBe("c5");
    expect(f6?.value).toBe(base.facts.find((entry) => entry.id === "f6")?.value);
    expect(derived.facts).toHaveLength(base.facts.length);
  });

  it("手順3: requires5pが非nullならrequiresとして使う", () => {
    const base = mergeGapCase();
    base.variants[0]!.contradictions = [contradiction(["f1", "f2", "f3"], "c1_exposed", ["f1", "f2"])];
    const derived = derive5p(base);
    expect(derived.variants[0]?.contradictions[0]?.requires).toEqual(["f1", "f2"]);
    // 6人版のデータは書き換えない
    expect(base.variants[0]?.contradictions[0]?.requires).toEqual(["f1", "f2", "f3"]);
  });

  it("手順3: requires5pがnullならrequiresをそのまま使う", () => {
    const derived = derive5p(validCase());
    expect(derived.variants[0]?.contradictions[0]?.requires).toEqual(["f1", "f2", "f3", "f4", "f5", "f6"]);
  });

  it("手順4: 統合されたキャラクターが犯人のバリアントを除外する", () => {
    const derived = derive5p(validCase());
    expect(derived.variants.map((variant) => variant.culprit)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("手順1と2の後に手順3を適用する（統合後の所有関係を前提にrequires5pが書かれる）", () => {
    // requires5pが指す事実の所有者は、導出後のデータで解決できる必要がある
    const base = mergeGapCase();
    base.variants[0]!.contradictions = [contradiction(["f1", "f2", "f3"], "c1_exposed", ["f1", "f3"])];
    const derived = derive5p(base);
    const requires = derived.variants[0]!.contradictions[0]!.requires;
    const owners = requires.map((id) => derived.facts.find((entry) => entry.id === id)?.owner);
    expect(owners).toEqual(["c1", "c2"]);
  });
});

describe("has5p / mergedAwayIds", () => {
  it("統合指定があり、導出後の人数が下限以上なら5人版を導出する", () => {
    expect(has5p(validCase())).toBe(true);
    expect(mergedAwayIds(validCase())).toEqual(["c6"]);
  });

  it("統合指定がなければ5人版を導出しない", () => {
    const base = validCase();
    for (const character of base.characters) {
      character.merge5p = null;
    }
    expect(has5p(base)).toBe(false);
    expect(mergedAwayIds(base)).toEqual([]);
  });

  it("導出後の人数がplayerCountの下限を下回るなら5人版を導出しない", () => {
    const base = validCase();
    base.playerCount = [6, 6];
    expect(has5p(base)).toBe(false);
  });
});
