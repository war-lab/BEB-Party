// 検証10項目。正常なパックを1項目だけ壊し、その項目だけが落ちることを確かめる（基本設計/11の検証項目）
import { MIN_HINTS, MIN_KEY_EXPRESSIONS, MIN_QUESTIONS, type WhoWroteThisPack } from "@beb/shared-whowrotethis";
import { describe, expect, it } from "vitest";
import { validPack } from "./test-support/fixtures";
import { formatFinding, validateContent, validatePack, type ValidationItem } from "./validate-content";

function itemsOf(pack: unknown): ValidationItem[] {
  return validatePack(pack).findings.map((finding) => finding.item);
}

describe("正常なパック", () => {
  it("反例が出ない", () => {
    const report = validatePack(validPack());
    expect(report.findings).toEqual([]);
    expect(report.errorCount).toBe(0);
    expect(validateContent(validPack()).valid).toBe(true);
  });
});

describe("schema", () => {
  it("必須欄の欠落を落とす", () => {
    expect(itemsOf({ id: "x" })).toContain("schema");
    expect(itemsOf(null)).toContain("schema");
    expect(itemsOf({ ...validPack(), questions: "not-array" })).toContain("schema");
  });

  it("hintEnの要素が文字列でない場合を落とす", () => {
    const pack = validPack();
    const broken = {
      ...pack,
      questions: pack.questions.map((question, index) => (index === 0 ? { ...question, hintEn: [1, 2, 3] } : question)),
    };
    expect(itemsOf(broken)).toContain("schema");
  });
});

describe("検証2: 質問数の下限", () => {
  it("下限未満を落とす", () => {
    const report = validatePack(validPack(MIN_QUESTIONS - 1));
    expect(report.findings.map((finding) => finding.item)).toEqual([2]);
  });

  it("下限ちょうどを通す", () => {
    expect(validatePack(validPack(MIN_QUESTIONS)).errorCount).toBe(0);
  });
});

describe("検証3: 質問idの一意性", () => {
  it("重複を落とす", () => {
    const pack = validPack();
    const broken: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question) => ({ ...question, id: "same" })),
    };
    expect(itemsOf(broken)).toContain(3);
  });
});

describe("検証4: enが疑問符で終わる", () => {
  it("疑問符が無い質問を落とす", () => {
    const pack = validPack();
    const broken: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) =>
        index === 0 ? { ...question, en: "Tell me your favorite food." } : question,
      ),
    };
    expect(itemsOf(broken)).toEqual([4]);
  });

  it("末尾の空白は許す", () => {
    const pack = validPack();
    const ok: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) =>
        index === 0 ? { ...question, en: "What do you eat? " } : question,
      ),
    };
    expect(validatePack(ok).errorCount).toBe(0);
  });
});

describe("検証5: enとjaが空でない", () => {
  it("空白のみを落とす", () => {
    const pack = validPack();
    const broken: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) => (index === 0 ? { ...question, ja: "   " } : question)),
    };
    expect(itemsOf(broken)).toContain(5);
  });
});

describe("検証6: hintEnの件数", () => {
  it("下限未満を落とす", () => {
    const pack = validPack();
    const broken: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) =>
        index === 0 ? { ...question, hintEn: question.hintEn.slice(0, MIN_HINTS - 1) } : question,
      ),
    };
    expect(itemsOf(broken)).toEqual([6]);
  });
});

describe("検証7: hintEnの語数", () => {
  it("最低語数未満のhintEnを落とす", () => {
    // 検証10と独立に見るため、空欄は含めたうえで語数だけ足りない入力を使う
    const pack = validPack();
    const broken: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) =>
        index === 0 ? { ...question, hintEn: ["I want ...", ...question.hintEn.slice(1)] } : question,
      ),
    };
    expect(itemsOf(broken)).toEqual([7]);
  });

  it("全角空白で区切られたhintEnは正規化して数える", () => {
    const pack = validPack();
    const ok: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) =>
        index === 0 ? { ...question, hintEn: ["I　like　...　too.", ...question.hintEn.slice(1)] } : question,
      ),
    };
    expect(validatePack(ok).errorCount).toBe(0);
  });
});

describe("検証10: hintEnが完成した回答文でない", () => {
  it("空欄を含まないhintEnを落とす", () => {
    // 語数は足りているが、そのまま提出できる完成文になっている入力
    const pack = validPack();
    const broken: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) =>
        index === 0 ? { ...question, hintEn: ["I would eat curry today.", ...question.hintEn.slice(1)] } : question,
      ),
    };
    expect(itemsOf(broken)).toEqual([10]);
  });

  it("空欄を含むhintEnを通す", () => {
    expect(validatePack(validPack()).errorCount).toBe(0);
  });

  it("反例に完成文の中身を出す", () => {
    const pack = validPack();
    const broken: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) =>
        index === 0 ? { ...question, hintEn: ["I would eat curry today.", ...question.hintEn.slice(1)] } : question,
      ),
    };
    expect(formatFinding(validatePack(broken).findings[0]!)).toContain("I would eat curry today.");
  });
});

describe("検証8: keyExpressionsの件数", () => {
  it("下限未満を落とす", () => {
    const pack = validPack();
    const broken: WhoWroteThisPack = {
      ...pack,
      keyExpressions: pack.keyExpressions.slice(0, MIN_KEY_EXPRESSIONS - 1),
    };
    expect(itemsOf(broken)).toEqual([8]);
  });
});

describe("検証9: 質問文の重複", () => {
  it("正規化して一致する質問文を落とす", () => {
    const pack = validPack();
    const first = pack.questions[0]!;
    const broken: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) =>
        index === 1 ? { ...question, en: `  ${first.en.toUpperCase()}  ` } : question,
      ),
    };
    expect(itemsOf(broken)).toEqual([9]);
  });
});

describe("formatFinding", () => {
  it("パックid・質問id・検証項目の3欄を出す", () => {
    const pack = validPack();
    const broken: WhoWroteThisPack = {
      ...pack,
      questions: pack.questions.map((question, index) =>
        index === 0 ? { ...question, en: "No question mark." } : question,
      ),
    };
    const finding = validatePack(broken).findings[0]!;
    const line = formatFinding(finding);
    expect(line).toContain("fixture_pack");
    expect(line).toContain("q_1");
    expect(line).toContain("検証4");
  });

  it("パック単位の項目は質問idの代わりにパック全体と出す", () => {
    const finding = validatePack(validPack(MIN_QUESTIONS - 1)).findings[0]!;
    expect(formatFinding(finding)).toContain("パック全体");
  });
});

describe("validateContent", () => {
  it("反例を理由の文字列にまとめる", () => {
    const result = validateContent(validPack(MIN_QUESTIONS - 1));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("検証2");
  });
});
