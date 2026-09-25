// 舞台パック検証10項目。正常なパックを1項目だけ壊し、その項目だけが落ちることを確かめる
// （基本設計/13の検証項目）。
import type { EscapeCallPack } from "@beb/shared-escapecall";
import { describe, expect, it } from "vitest";
import { validPack } from "./test-support/fixtures";
import { formatFinding, validateContent, validatePack, type ValidationItem } from "./validate-content";

function itemsOf(pack: unknown): ValidationItem[] {
  return validatePack(pack).findings.map((finding) => finding.item);
}

/** 正常なパックへ1手だけ変更を加える */
function broken(mutate: (pack: EscapeCallPack) => void): EscapeCallPack {
  const pack = validPack();
  mutate(pack);
  return pack;
}

describe("正常なパック", () => {
  it("反例が出ない", () => {
    const report = validatePack(validPack());
    expect(report.findings.map(formatFinding)).toEqual([]);
    expect(validateContent(validPack()).valid).toBe(true);
  });
});

describe("検証1: 構造", () => {
  it("オブジェクトでない値を落とす", () => {
    expect(itemsOf("pack")).toEqual(["schema"]);
  });

  it("必須欄の欠落を落とす", () => {
    const pack = validPack() as unknown as Record<string, unknown>;
    delete pack.scene;
    expect(itemsOf(pack)).toContain("schema");
  });

  // ADR-0027。錠をコンテンツへ書き始めると、生成で保証した可解性の外に出る
  it("錠の答えなど定義に無い欄を落とす", () => {
    expect(itemsOf({ ...validPack(), codes: ["1234"] })).toContain("schema");
  });
});

describe("値の検証", () => {
  it("検証2: idの形が違うと落ちる", () => {
    expect(itemsOf(broken((pack) => (pack.id = "Bad-ID")))).toEqual([2]);
  });

  it("検証3: 錠の名前が3件でないと落ちる", () => {
    expect(itemsOf(broken((pack) => pack.lockLabels.pop()))).toEqual([3]);
  });

  // 規則を足したときの言い回しの書き漏らし（ADR-0027の影響）
  it("検証4: 規則の言い回しが欠けると落ち、未知の規則IDがあっても落ちる", () => {
    expect(
      itemsOf(
        broken((pack) => {
          delete (pack.rulePhrases as Record<string, unknown>).reverse;
        }),
      ),
    ).toEqual([4]);
    expect(
      itemsOf(
        broken((pack) => {
          (pack.rulePhrases as Record<string, unknown>).double = { easy: "x", standard: "x", ja: "x" };
        }),
      ),
    ).toEqual([4]);
  });

  it("検証5: 言い回しが空だと落ちる", () => {
    expect(itemsOf(broken((pack) => (pack.rulePhrases.reverse.easy = " ")))).toEqual([5]);
  });

  // 穴が無いと除く対象が伝わらず、余分な穴は {color} のまま画面に出る
  it("検証6〜8: 穴の過不足を落とす", () => {
    expect(itemsOf(broken((pack) => (pack.rulePhrases.skip_color.standard = "Ignore them.")))).toEqual([6]);
    expect(itemsOf(broken((pack) => (pack.rulePhrases.skip_shape.ja = "{shape}と{color}")))).toEqual([7]);
    expect(itemsOf(broken((pack) => (pack.rulePhrases.add_one.easy = "Add one to {color}.")))).toEqual([8]);
  });

  it("検証9: keyExpressionsが3件未満だと落ちる", () => {
    expect(itemsOf(broken((pack) => pack.keyExpressions.pop()))).toEqual([9]);
  });
});
