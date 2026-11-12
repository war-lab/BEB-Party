// お題パックの検証7項目（基本設計/15の検証項目、テスト観点「検証」）。
//
// 1項目だけを壊したパックで、その項目が落ちることを確かめる。
import { describe, expect, it } from "vitest";
import basic from "../../../../content/mindmeld/basic.json";
import { validPack, validPrompts } from "./test-support/fixtures";
import { THRESHOLDS, formatFinding, validateContent, validatePack, type ValidationItem } from "./validate-content";

function itemsOf(content: unknown): ValidationItem[] {
  return validatePack(content).findings.map((finding) => finding.item);
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
    expect(itemsOf({ ...validPack(), prompts: "kitchen" })).toEqual([1]);
    expect(itemsOf("not an object")).toEqual([1]);
  });

  it("定義に無い欄を、prompts と keyExpressions の要素の中まで落とす", () => {
    expect(itemsOf({ ...validPack(), answers: [] })).toEqual([1]);
    const prompts = validPrompts().map((entry, index) => (index === 0 ? { ...entry, answer: "pan" } : entry));
    expect(itemsOf({ ...validPack(), prompts })).toEqual([1]);
    const keyExpressions = validPack().keyExpressions.map((entry, index) =>
      index === 0 ? { ...entry, note: "x" } : entry,
    );
    expect(itemsOf({ ...validPack(), keyExpressions })).toEqual([1]);
  });

  it("要素の型違いを落とす", () => {
    const prompts = [...validPrompts(), { id: "x", en: 3, ja: "数" }];
    expect(itemsOf({ ...validPack(), prompts })).toEqual([1]);
  });
});

describe("検証2〜7", () => {
  it("検証2: パックとお題のidの形、お題のidの重複", () => {
    expect(itemsOf({ ...validPack(), id: "Bad-Id" })).toEqual([2]);
    expect(itemsOf({ ...validPack(), id: "a".repeat(17) })).toEqual([2]);
    const badId = validPrompts().map((entry, index) => (index === 0 ? { ...entry, id: "Kitchen" } : entry));
    expect(itemsOf({ ...validPack(), prompts: badId })).toEqual([2]);
    const duplicated = validPrompts().map((entry, index) => (index === 1 ? { ...entry, id: "kitchen" } : entry));
    expect(itemsOf({ ...validPack(), prompts: duplicated })).toEqual([2]);
  });

  it("検証3: お題が12件未満なら落ちる", () => {
    expect(THRESHOLDS.minPrompts).toBe(12);
    expect(itemsOf({ ...validPack(), prompts: validPrompts().slice(0, 11) })).toEqual([3]);
  });

  it("検証4: 使えない文字、語数の範囲外、61文字以上", () => {
    const replaceFirst = (en: string) =>
      validPrompts().map((entry, index) => (index === 0 ? { ...entry, en } : entry));
    expect(itemsOf({ ...validPack(), prompts: replaceFirst("Something in a kitchen!") })).toEqual([4]);
    expect(itemsOf({ ...validPack(), prompts: replaceFirst("Something in a 2nd kitchen") })).toEqual([4]);
    expect(itemsOf({ ...validPack(), prompts: replaceFirst("Kitchen") })).toEqual([4]);
    expect(itemsOf({ ...validPack(), prompts: replaceFirst("one two three four five six seven eight nine") })).toEqual([4]);
    // 8語で60文字は通り、61文字は落ちる
    const exactly60 = "Somethinggg youuuuuu cannnnn findddd in aaaa kitchennnnnn ok";
    expect([...exactly60].length).toBe(60);
    expect(itemsOf({ ...validPack(), prompts: replaceFirst(exactly60) })).toEqual([]);
    expect(itemsOf({ ...validPack(), prompts: replaceFirst(`${exactly60}k`) })).toEqual([4]);
    // 使える記号だけなら通る
    expect(itemsOf({ ...validPack(), prompts: replaceFirst("What's in a mom-and-pop shop, really?") })).toEqual([]);
  });

  it("検証5: 正規化したenが重複すると落ちる", () => {
    const prompts = validPrompts().map((entry, index) =>
      index === 1 ? { ...entry, en: "something  IN a kitchen?" } : entry,
    );
    expect(itemsOf({ ...validPack(), prompts })).toEqual([5]);
  });

  it("検証6: keyExpressionsが5件未満なら落ちる", () => {
    expect(itemsOf({ ...validPack(), keyExpressions: validPack().keyExpressions.slice(0, 4) })).toEqual([6]);
  });

  it("検証7: en と ja と title が空白だけなら落ちる", () => {
    const prompts = validPrompts().map((entry, index) => (index === 0 ? { ...entry, ja: "  " } : entry));
    expect(itemsOf({ ...validPack(), prompts })).toEqual([7]);
    const keyExpressions = validPack().keyExpressions.map((entry, index) => (index === 0 ? { ...entry, en: " " } : entry));
    expect(itemsOf({ ...validPack(), keyExpressions })).toEqual([7]);
    expect(itemsOf({ ...validPack(), title: " " })).toEqual([7]);
  });
});

describe("formatFinding", () => {
  it("パックid / お題id / 検証項目 を1行目に出す", () => {
    const prompts = validPrompts().map((entry, index) => (index === 0 ? { ...entry, id: "Kitchen" } : entry));
    const [finding] = validatePack({ ...validPack(), prompts }).findings;
    expect(formatFinding(finding!)).toMatch(/^\[ERROR\] fixture_pack \/ Kitchen \/ 検証2: /u);
  });
});

describe("収録パック", () => {
  // 全件の検証は pnpm validate:content が行う。ここは収録パックが検証を通る状態を単体テストでも固定する
  it("basic がすべての検証を通る", () => {
    expect(validatePack(basic).findings.map(formatFinding)).toEqual([]);
  });
});
