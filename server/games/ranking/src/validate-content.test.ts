// 検証14項目。正常なパックを1項目だけ壊し、その項目だけが落ちることを確かめる（基本設計/10の検証項目）
import { describe, expect, it } from "vitest";
import { validatePack } from "./validate-content";
import { validSet, validPack } from "./test-support/fixtures";

function itemsOf(report: ReturnType<typeof validatePack>): (number | string)[] {
  return report.findings.map((finding) => finding.item);
}

describe("正常なパック", () => {
  it("エラーなしで通る", () => {
    const report = validatePack(validPack());
    expect(report.findings.map((finding) => finding.message)).toEqual([]);
    expect(report.errorCount).toBe(0);
  });
});

describe("schema", () => {
  it("オブジェクトでない入力を落とす", () => {
    expect(validatePack("nope").errorCount).toBeGreaterThan(0);
    expect(itemsOf(validatePack("nope"))).toContain("schema");
  });

  it("必須欄の欠落を落とす", () => {
    const pack = validPack() as unknown as Record<string, unknown>;
    delete pack["title"];
    expect(itemsOf(validatePack(pack))).toContain("schema");
  });

  it("未知のtypeの述語を落とす", () => {
    const pack = validPack();
    (pack.sets[0]!.goals[0]!.goal as unknown as Record<string, unknown>)["type"] = "sideways";
    expect(itemsOf(validatePack(pack))).toContain("schema");
  });

  it("項目数が5でないものを構造の段で落とす", () => {
    const pack = validPack();
    pack.sets[0]!.items.pop();
    expect(itemsOf(validatePack(pack))).toContain("schema");
  });
});

describe("検証2: セット数の下限", () => {
  it("6件未満を落とす", () => {
    const report = validatePack(validPack(5));
    expect(itemsOf(report)).toContain(2);
  });

  it("6件は通る", () => {
    expect(validatePack(validPack(6)).errorCount).toBe(0);
  });
});

describe("検証3: セットidの一意", () => {
  it("重複を落とす", () => {
    const pack = validPack();
    pack.sets[1] = { ...validSet(1) };
    expect(itemsOf(validatePack(pack))).toContain(3);
  });
});

describe("検証4: 項目", () => {
  it("idの重複を落とす", () => {
    const pack = validPack();
    pack.sets[0]!.items[1]!.id = pack.sets[0]!.items[0]!.id;
    const report = validatePack(pack);
    expect(itemsOf(report)).toContain(4);
  });
});

describe("検証5: 目標の件数とid", () => {
  it("6件でないものを落とす", () => {
    const pack = validPack();
    pack.sets[0]!.goals.pop();
    expect(itemsOf(validatePack(pack))).toContain(5);
  });

  it("idの重複を落とす", () => {
    const pack = validPack();
    pack.sets[0]!.goals[1]!.id = pack.sets[0]!.goals[0]!.id;
    expect(itemsOf(validatePack(pack))).toContain(5);
  });
});

describe("検証6: 難度の構成", () => {
  it("1,1,2,2,3,3 でないものを落とす", () => {
    const pack = validPack();
    // 難度3を1枚だけにする（5人のとき落とす枚が無くなる）
    pack.sets[0]!.goals[5]!.difficulty = 1;
    pack.sets[0]!.goals[5]!.goal = { type: "above", item: "e", than: "d" };
    expect(itemsOf(validatePack(pack))).toContain(6);
  });
});

describe("検証7: 述語の参照", () => {
  it("存在しないitemを落とす", () => {
    const pack = validPack();
    pack.sets[0]!.goals[0]!.goal = { type: "above", item: "zzz", than: "b" };
    expect(itemsOf(validatePack(pack))).toContain(7);
  });

  it("存在しないthanを落とす", () => {
    const pack = validPack();
    pack.sets[0]!.goals[0]!.goal = { type: "above", item: "a", than: "zzz" };
    expect(itemsOf(validatePack(pack))).toContain(7);
  });

  it("itemとthanが同じものを落とす", () => {
    const pack = validPack();
    pack.sets[0]!.goals[0]!.goal = { type: "above", item: "a", than: "a" };
    expect(itemsOf(validatePack(pack))).toContain(7);
  });
});

describe("検証8: 順位の範囲", () => {
  it("0や6を落とす", () => {
    const pack = validPack();
    pack.sets[0]!.goals[4]!.goal = { type: "exact", item: "c", rank: 6 };
    expect(itemsOf(validatePack(pack))).toContain(8);
  });
});

describe("検証9: 宣言した難度", () => {
  it("述語から導く難度と違うものを落とす", () => {
    const pack = validPack();
    // above は難度1だが2を宣言する
    pack.sets[0]!.goals[0]!.difficulty = 2;
    pack.sets[0]!.goals[2]!.difficulty = 1;
    expect(itemsOf(validatePack(pack))).toContain(9);
  });
});

describe("検証10: 述語の重複", () => {
  it("同じ述語を持つ2枚を落とす", () => {
    const pack = validPack();
    pack.sets[0]!.goals[1]!.goal = { type: "above", item: "a", than: "b" };
    expect(itemsOf(validatePack(pack))).toContain(10);
  });
});

describe("検証11: 達成可能性", () => {
  // 検証7（参照の存在）と検証8（順位の範囲）を通った述語は、単独では必ず達成可能である。
  // そのため検証11は単独では発火しない。参照が壊れたときに検証7と一緒に落ちる安全網として置く。
  it("参照が壊れた目標は検証7と一緒に落ちる", () => {
    const pack = validPack();
    pack.sets[0]!.goals[4]!.goal = { type: "exact", item: "zzz", rank: 3 };
    const found = itemsOf(validatePack(pack));
    expect(found).toContain(7);
    expect(found).toContain(11);
  });

  it("正常なパックでは発火しない", () => {
    expect(validatePack(validPack()).findings.filter((finding) => finding.item === 11)).toHaveLength(0);
  });
});

describe("検証12: 全目標の同時達成", () => {
  it("全て同時に達成できるセットを落とす", () => {
    const pack = validPack();
    // 6枚すべてを a,b,c,d,e の順で成立する述語に置き換える
    const set = pack.sets[0]!;
    set.goals = [
      { ...set.goals[0]!, difficulty: 1, goal: { type: "above", item: "a", than: "b" } },
      { ...set.goals[1]!, difficulty: 1, goal: { type: "above", item: "b", than: "c" } },
      { ...set.goals[2]!, difficulty: 2, goal: { type: "top", item: "a", within: 1 } },
      { ...set.goals[3]!, difficulty: 2, goal: { type: "bottom", item: "e", within: 1 } },
      { ...set.goals[4]!, difficulty: 3, goal: { type: "exact", item: "c", rank: 3 } },
      { ...set.goals[5]!, difficulty: 3, goal: { type: "exact", item: "d", rank: 4 } },
    ];
    expect(itemsOf(validatePack(pack))).toContain(12);
  });
});

describe("検証13: 同時達成の下限", () => {
  it("最大2枚しか同時に達成できないセットを落とす", () => {
    const pack = validPack();
    const set = pack.sets[0]!;
    // 3枚が互いに1位を争う形にすると、同時達成は最大2枚になる
    set.goals = [
      { ...set.goals[0]!, difficulty: 1, goal: { type: "above", item: "a", than: "b" } },
      { ...set.goals[1]!, difficulty: 1, goal: { type: "above", item: "b", than: "a" } },
      { ...set.goals[2]!, difficulty: 2, goal: { type: "top", item: "c", within: 1 } },
      { ...set.goals[3]!, difficulty: 2, goal: { type: "top", item: "d", within: 1 } },
      { ...set.goals[4]!, difficulty: 3, goal: { type: "exact", item: "e", rank: 1 } },
      { ...set.goals[5]!, difficulty: 3, goal: { type: "exact", item: "a", rank: 1 } },
    ];
    const report = validatePack(pack);
    expect(itemsOf(report)).toContain(13);
  });
});

describe("検証14: 表示の完全性", () => {
  it("日本語文が空のものを落とす", () => {
    const pack = validPack();
    pack.sets[0]!.goals[0]!.ja = "   ";
    expect(itemsOf(validatePack(pack))).toContain(14);
  });

  it("hintEnが3件未満のものを落とす", () => {
    const pack = validPack();
    pack.sets[0]!.goals[0]!.hintEn = ["only one"];
    expect(itemsOf(validatePack(pack))).toContain(14);
  });

  it("keyExpressionsが空のものを落とす", () => {
    const pack = validPack();
    pack.sets[0]!.keyExpressions = [];
    expect(itemsOf(validatePack(pack))).toContain(14);
  });
});

describe("反例の整形", () => {
  it("パックid・セットid・検証項目が読める", () => {
    const pack = validPack(5);
    const report = validatePack(pack);
    expect(report.packId).toBe("fixture_pack");
    expect(report.findings.some((finding) => finding.setId === null)).toBe(true);
  });
});
