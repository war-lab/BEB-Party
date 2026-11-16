// お題セットの検証8項目（基本設計/16の検証項目、テスト観点「検証」）。
//
// 1項目だけを壊したセットで、その項目が落ちることを確かめる。
import { describe, expect, it } from "vitest";
import everydayThings from "../../../../content/twoheaded/everyday-things.json";
import { validCards, validSet } from "./test-support/fixtures";
import {
  THRESHOLDS,
  formatFinding,
  normalizeAnswer,
  validateContent,
  validateSet,
  type ValidationItem,
} from "./validate-content";

function itemsOf(content: unknown): ValidationItem[] {
  return validateSet(content).findings.map((finding) => finding.item);
}

/** 先頭のカードだけを差し替えたセット */
function withFirstCard(patch: Record<string, unknown>): unknown {
  const cards = validCards().map((card, index) => (index === 0 ? { ...card, ...patch } : card));
  return { ...validSet(), cards };
}

describe("基準のセット", () => {
  it("すべての項目を通る", () => {
    expect(itemsOf(validSet())).toEqual([]);
    expect(validateContent(validSet())).toEqual({ valid: true });
  });

  it("収録したセットはすべての項目を通る", () => {
    const report = validateSet(everydayThings);
    expect(report.findings.map(formatFinding)).toEqual([]);
  });
});

describe("検証1（スキーマ）", () => {
  it("必須欄の欠落と型違いを落とす", () => {
    const { title: _title, ...withoutTitle } = validSet();
    expect(itemsOf(withoutTitle)).toEqual([1]);
    const { starters: _starters, ...withoutStarters } = validSet();
    expect(itemsOf(withoutStarters)).toEqual([1]);
    expect(itemsOf({ ...validSet(), cards: "umbrella" })).toEqual([1]);
    expect(itemsOf(withFirstCard({ ja: 3 }))).toEqual([1]);
    expect(itemsOf(withFirstCard({ aliases: "fridge" }))).toEqual([1]);
    expect(itemsOf(withFirstCard({ aliases: [""] }))).toEqual([1]);
    expect(itemsOf("not an object")).toEqual([1]);
  });

  it("定義に無い欄を、カードと言い回しの要素の中まで落とす", () => {
    expect(itemsOf({ ...validSet(), constraints: [] })).toEqual([1]);
    // DON'T SAY ITの禁止語の欄を写し忘れて残した場合も落とす
    expect(itemsOf(withFirstCard({ taboo: ["rain"] }))).toEqual([1]);
    const starters = validSet().starters.map((entry, index) => (index === 0 ? { ...entry, note: "x" } : entry));
    expect(itemsOf({ ...validSet(), starters })).toEqual([1]);
  });

  it("カードidがセット内で一意でなければ落とす", () => {
    const cards = validCards().map((card, index) => (index === 1 ? { ...card, id: "card_001" } : card));
    expect(itemsOf({ ...validSet(), cards })).toEqual([1]);
  });
});

describe("検証2〜8", () => {
  it("検証2: answerの文字種と先頭", () => {
    expect(itemsOf(withFirstCard({ answer: "T-shirt" }))).toEqual([]);
    expect(itemsOf(withFirstCard({ answer: "rock'n'roll" }))).toEqual([]);
    expect(itemsOf(withFirstCard({ answer: "7-Eleven" }))).toEqual([2]);
    expect(itemsOf(withFirstCard({ answer: "-dash" }))).toEqual([2]);
    expect(itemsOf(withFirstCard({ answer: "café" }))).toEqual([2]);
  });

  it("検証3: 正規化したanswerの重複", () => {
    expect(normalizeAnswer("  Ice-Cream ")).toBe("ice cream");
    // 2枚目を1枚目と大文字小文字・ハイフンだけが違う名前にする
    const cards = validCards().map((card, index) => (index === 1 ? { ...card, answer: "THING-a" } : card));
    expect(itemsOf({ ...validSet(), cards })).toEqual([3]);
  });

  it("検証4: カードが40枚未満なら落ちる", () => {
    expect(THRESHOLDS.minCards).toBe(40);
    expect(itemsOf({ ...validSet(), cards: validCards(39) })).toEqual([4]);
    expect(itemsOf({ ...validSet(), cards: validCards(40) })).toEqual([]);
  });

  it("検証5: jaに日本語の文字が無い", () => {
    expect(itemsOf(withFirstCard({ ja: "umbrella" }))).toEqual([5]);
    expect(itemsOf(withFirstCard({ ja: "ー" }))).toEqual([]);
  });

  it("検証6: 別名の文字種・件数・answerとの重複", () => {
    expect(itemsOf(withFirstCard({ aliases: ["a", "b", "c"] }))).toEqual([]);
    expect(itemsOf(withFirstCard({ aliases: ["a", "b", "c", "d"] }))).toEqual([6]);
    expect(itemsOf(withFirstCard({ aliases: ["2nd"] }))).toEqual([6]);
    expect(itemsOf(withFirstCard({ aliases: ["Thing-A"] }))).toEqual([6]);
  });

  it("検証7: 書き出しの件数と空欄、重要表現の件数", () => {
    expect(itemsOf({ ...validSet(), starters: validSet().starters.slice(0, 2) })).toEqual([7]);
    const noBlank = validSet().starters.map((entry, index) => (index === 0 ? { ...entry, en: "It is a thing." } : entry));
    expect(itemsOf({ ...validSet(), starters: noBlank })).toEqual([7]);
    expect(itemsOf({ ...validSet(), keyExpressions: [] })).toEqual([7]);
  });

  it("検証8: 空白だけの表示文言", () => {
    expect(itemsOf({ ...validSet(), title: "  " })).toEqual([8]);
    // ja が空白だけのカードは検証5（日本語の文字が無い）にも当たる
    expect(itemsOf(withFirstCard({ ja: " " }))).toEqual([5, 8]);
    expect(itemsOf({ ...validSet(), keyExpressions: [{ en: " ", ja: "空" }] })).toEqual([8]);
    const blankStarter = validSet().starters.map((entry, index) => (index === 0 ? { ...entry, ja: "  " } : entry));
    expect(itemsOf({ ...validSet(), starters: blankStarter })).toEqual([8]);
  });
});

describe("validateContent", () => {
  it("落ちた項目を反例の文字列で返す", () => {
    const result = validateContent({ ...validSet(), cards: validCards(10) });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("検証4");
    expect(result.reason).toContain("fixture_set_v1");
  });
});
