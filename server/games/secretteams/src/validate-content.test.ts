// テーマパックの検証10項目（基本設計/17の検証項目、テスト観点「検証」）。
//
// 1項目だけを壊したパックで、その項目が落ちることを確かめる。
import type { SecretTeamsPack, ThemeSpec } from "@beb/shared-secretteams";
import { describe, expect, it } from "vitest";
import basic from "../../../../content/secretteams/basic.json";
import { validPack } from "./test-support/fixtures";
import { THRESHOLDS, formatFinding, validateContent, validatePack, type ValidationItem } from "./validate-content";

function itemsOf(content: unknown): ValidationItem[] {
  return validatePack(content).findings.map((finding) => finding.item);
}

/** 最初の系統の最初のテーマだけを書き換えたパック */
function withFirstTheme(change: (theme: ThemeSpec) => ThemeSpec): SecretTeamsPack {
  const pack = validPack();
  const [first, ...rest] = pack.families;
  const [head, ...others] = first!.themes;
  return { ...pack, families: [{ ...first!, themes: [change(head!), ...others] }, ...rest] };
}

/** 最初のテーマの最初の単語の en を書き換えたパック */
function withFirstWord(en: string): SecretTeamsPack {
  return withFirstTheme((theme) => ({
    ...theme,
    words: theme.words.map((word, index) => (index === 0 ? { ...word, en } : word)),
  }));
}

describe("基準のパック", () => {
  it("すべての項目を通る", () => {
    expect(itemsOf(validPack())).toEqual([]);
    expect(validateContent(validPack())).toEqual({ valid: true });
  });
});

describe("検証1（スキーマ）", () => {
  it("必須欄の欠落と型違いを落とす", () => {
    const { title: _title, ...withoutTitle } = validPack();
    expect(itemsOf(withoutTitle)).toEqual([1]);
    expect(itemsOf({ ...validPack(), families: "water" })).toEqual([1]);
    expect(itemsOf("not an object")).toEqual([1]);
    expect(itemsOf(withFirstTheme((theme) => ({ ...theme, words: "whale" as never })))).toEqual([1]);
    expect(itemsOf(withFirstWord(3 as never))).toEqual([1]);
    // 空文字の ja は構造検証で落ちる
    expect(itemsOf(withFirstTheme((theme) => ({ ...theme, ja: "" })))).toEqual([1]);
  });

  it("定義に無い欄を、keyExpressions・families・themes・words の要素の中まで落とす", () => {
    expect(itemsOf({ ...validPack(), answers: [] })).toEqual([1]);
    const keyExpressions = validPack().keyExpressions.map((entry, index) => (index === 0 ? { ...entry, note: "x" } : entry));
    expect(itemsOf({ ...validPack(), keyExpressions })).toEqual([1]);
    const families = validPack().families.map((family, index) => (index === 0 ? { ...family, label: "水" } : family));
    expect(itemsOf({ ...validPack(), families })).toEqual([1]);
    expect(itemsOf(withFirstTheme((theme) => ({ ...theme, real: true }) as ThemeSpec))).toEqual([1]);
    expect(
      itemsOf(
        withFirstTheme((theme) => ({
          ...theme,
          words: theme.words.map((word, index) => (index === 0 ? { ...word, level: 1 } : word)),
        })),
      ),
    ).toEqual([1]);
  });
});

describe("検証2〜10", () => {
  it("検証2: パック・系統・テーマのidの形と、系統とテーマのidのパック内の重複", () => {
    expect(itemsOf({ ...validPack(), id: "Bad-Id" })).toEqual([2]);
    expect(itemsOf({ ...validPack(), id: "a".repeat(17) })).toEqual([2]);
    const families = validPack().families.map((family, index) => (index === 0 ? { ...family, id: "Water" } : family));
    expect(itemsOf({ ...validPack(), families })).toEqual([2]);
    const sameFamily = validPack().families.map((family, index) => (index === 1 ? { ...family, id: "water" } : family));
    expect(itemsOf({ ...validPack(), families: sameFamily })).toEqual([2]);
    expect(itemsOf(withFirstTheme((theme) => ({ ...theme, id: "Ocean" })))).toEqual([2]);
    // 系統をまたいだテーマのidの重複
    expect(itemsOf(withFirstTheme((theme) => ({ ...theme, id: "space" })))).toEqual([2]);
  });

  it("検証3: 系統が2件未満、テーマが3件未満の系統があると落ちる", () => {
    expect(THRESHOLDS.minFamilies).toBe(2);
    expect(THRESHOLDS.minThemesPerFamily).toBe(3);
    expect(itemsOf({ ...validPack(), families: validPack().families.slice(0, 1) })).toEqual([3]);
    const families = validPack().families.map((family, index) =>
      index === 0 ? { ...family, themes: family.themes.slice(0, 2) } : family,
    );
    expect(itemsOf({ ...validPack(), families })).toEqual([3]);
  });

  it("検証4: 単語が6件未満のテーマがあると落ちる", () => {
    expect(THRESHOLDS.minWordsPerTheme).toBe(6);
    expect(itemsOf(withFirstTheme((theme) => ({ ...theme, words: theme.words.slice(0, 5) })))).toEqual([4]);
  });

  it("検証5: 単語の en の形と21文字以上", () => {
    expect(itemsOf(withFirstWord("Whale"))).toEqual([5]);
    expect(itemsOf(withFirstWord("blue whale!"))).toEqual([5]);
    expect(itemsOf(withFirstWord("blue  whale"))).toEqual([5]);
    expect(itemsOf(withFirstWord("whale "))).toEqual([5]);
    expect(itemsOf(withFirstWord("whale2"))).toEqual([5]);
    // 空白とハイフンでつないだ語は通る
    expect(itemsOf(withFirstWord("blue whale"))).toEqual([]);
    expect(itemsOf(withFirstWord("sea-horse"))).toEqual([]);
    // 20文字は通り、21文字は落ちる
    const exactly20 = "abcdefghij klmnopqrs";
    expect([...exactly20].length).toBe(20);
    expect(itemsOf(withFirstWord(exactly20))).toEqual([]);
    expect(itemsOf(withFirstWord(`${exactly20}t`))).toEqual([5]);
  });

  it("検証6: 単語の en がパック全体で重複すると落ちる（同じテーマ・同じ系統・系統をまたぐ）", () => {
    expect(itemsOf(withFirstWord("wave"))).toEqual([6]);
    expect(itemsOf(withFirstWord("salmon"))).toEqual([6]);
    expect(itemsOf(withFirstWord("rocket"))).toEqual([6]);
  });

  it("検証7: 単語を区切った語がテーマの en と一致すると落ちる", () => {
    expect(itemsOf(withFirstWord("river fish"))).toEqual([7]);
    expect(itemsOf(withFirstWord("ocean"))).toEqual([7]);
    expect(itemsOf(withFirstWord("space-ship"))).toEqual([7]);
    // 一部に含むだけの語は落とさない（表記の一致で検出できる範囲に限る）
    expect(itemsOf(withFirstWord("spaceship"))).toEqual([]);
  });

  it("検証8: テーマの en が小文字に揃えて重複すると落ちる", () => {
    expect(itemsOf(withFirstTheme((theme) => ({ ...theme, en: "SPACE" })))).toEqual([8]);
  });

  it("検証9: keyExpressionsが5件未満なら落ちる", () => {
    expect(itemsOf({ ...validPack(), keyExpressions: validPack().keyExpressions.slice(0, 4) })).toEqual([9]);
  });

  it("検証10: ja と title が空白だけなら落ちる", () => {
    expect(itemsOf({ ...validPack(), title: " " })).toEqual([10]);
    const keyExpressions = validPack().keyExpressions.map((entry, index) => (index === 0 ? { ...entry, ja: " " } : entry));
    expect(itemsOf({ ...validPack(), keyExpressions })).toEqual([10]);
    expect(itemsOf(withFirstTheme((theme) => ({ ...theme, ja: "　 " })))).toEqual([10]);
    expect(
      itemsOf(
        withFirstTheme((theme) => ({
          ...theme,
          words: theme.words.map((word, index) => (index === 0 ? { ...word, ja: " " } : word)),
        })),
      ),
    ).toEqual([10]);
  });
});

describe("formatFinding", () => {
  it("パックid / 系統・テーマid / 検証項目 を1行目に出す", () => {
    const [finding] = validatePack(withFirstWord("wave")).findings;
    expect(formatFinding(finding!)).toMatch(/^\[ERROR\] fixture_pack \/ ocean \/ 検証6: /u);
  });
});

describe("収録パック", () => {
  // 全件の検証は pnpm validate:content が行う。ここは収録パックが検証を通る状態を単体テストでも固定する
  it("basic がすべての検証を通る", () => {
    expect(validatePack(basic).findings.map(formatFinding)).toEqual([]);
  });
});
