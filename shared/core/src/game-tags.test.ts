// タグの並びと判定。一覧で形が先に出ないこと、重複が二重に出ることを検出する
import { describe, expect, it } from "vitest";
import { FORMAT_TAGS, GAME_TAG_LABELS, TRAIT_TAGS, isFormatTag, sortGameTags } from "./game-tags";

describe("game-tags", () => {
  it("形を性質より先に、定義の順で並べ、重複を1つにする", () => {
    expect(sortGameTags(["hidden", "team"])).toEqual(["team", "hidden"]);
    expect(sortGameTags(["coop", "coop"])).toEqual(["coop"]);
    expect(sortGameTags(["hidden", "faction"])).toEqual(["faction", "hidden"]);
  });

  it("形のタグと性質のタグを見分ける", () => {
    for (const tag of FORMAT_TAGS) {
      expect(isFormatTag(tag)).toBe(true);
    }
    for (const tag of TRAIT_TAGS) {
      expect(isFormatTag(tag)).toBe(false);
    }
  });

  it("すべてのタグに表示の文言があり、文言が重複しない", () => {
    const labels = [...FORMAT_TAGS, ...TRAIT_TAGS].map((tag) => GAME_TAG_LABELS[tag]);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
