// 検証9項目それぞれについて、意図的に違反させたセットを用意し、その項目だけが落ちることを確かめる（09）
import { describe, expect, it } from "vitest";
import { MIN_CARDS } from "@beb/shared-dontsayit";
import { card, validSet } from "./test-support/fixtures";
import { formatFinding, validateContent, validateSet } from "./validate-content";

function itemsOf(content: unknown): (number | string)[] {
  return validateSet(content).findings.map((finding) => finding.item);
}

describe("正常なセット", () => {
  it("検証を通る", () => {
    const report = validateSet(validSet());
    expect(report.findings).toEqual([]);
    expect(report.errorCount).toBe(0);
  });

  it("GameModule.validateContent互換の入口も通る", () => {
    expect(validateContent(validSet())).toEqual({ valid: true });
  });
});

describe("検証1: 正解の非露出", () => {
  it("禁止語が正解名の語と一致するセットが落ちる", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.taboo = [first.answer, ...first.taboo.slice(1)];
    expect(itemsOf(target)).toEqual([1]);
  });

  it("正解名の語を含む禁止語も落ちる（Michael Jackson に対する Michael）", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.answer = "Michael Jackson";
    first.taboo = ["Michael", ...first.taboo.slice(1)];
    expect(itemsOf(target)).toEqual([1]);
  });

  it("複合語の禁止語は分割して比較する", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.answer = "Doraemon";
    first.taboo = ["time machine", "robot", "cat", "pocket", "future"];
    expect(itemsOf(target)).toEqual([]);
  });
});

describe("検証1の比較単位", () => {
  // 部分一致で判定すると、正解に短い語が含まれる場合に無関係な禁止語まで拒否する（実測）
  it("正解の語を部分文字列として含む禁止語は拒否しない", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.answer = "Winnie the Pooh";
    first.taboo = ["mother", "brother", "honey", "bear", "forest"];
    expect(itemsOf(target)).toEqual([]);
  });

  it("正解の語と完全一致する禁止語は拒否する", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.answer = "Winnie the Pooh";
    first.taboo = ["the", "honey", "bear", "forest", "piglet"];
    expect(itemsOf(target)).toEqual([1]);
  });
});

describe("検証8: 正解の一意", () => {
  it("同じ正解を2枚持つセットが落ちる", () => {
    const target = validSet();
    const second = target.cards[1];
    const first = target.cards[0];
    if (first === undefined || second === undefined) {
      throw new Error("フィクスチャが空である");
    }
    second.answer = first.answer;
    expect(itemsOf(target)).toEqual([8]);
  });

  it("大文字小文字と空白の違いだけの重複も落ちる", () => {
    const target = validSet();
    const second = target.cards[1];
    const first = target.cards[0];
    if (first === undefined || second === undefined) {
      throw new Error("フィクスチャが空である");
    }
    second.answer = `  ${first.answer.toUpperCase()}  `;
    // 文字種の検査（検証7）にも触れるため、正解の一意が含まれることだけを見る
    expect(itemsOf(target)).toContain(8);
  });
});

describe("検証9: 禁止語の形", () => {
  function withTaboo(taboo: string[]): unknown {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.taboo = taboo;
    return target;
  }

  it("数字を含む禁止語が落ちる", () => {
    expect(itemsOf(withTaboo(["P1kachu", "a", "b", "c", "d"]))).toContain(9);
  });

  it("アクセント付きの文字を含む禁止語が落ちる", () => {
    expect(itemsOf(withTaboo(["Pikachú", "a", "b", "c", "d"]))).toContain(9);
  });

  it("日本語の禁止語が落ちる", () => {
    expect(itemsOf(withTaboo(["アンパンマン", "a", "b", "c", "d"]))).toContain(9);
  });

  it("空白だけの禁止語が落ちる", () => {
    expect(itemsOf(withTaboo([" ", "a", "b", "c", "d"]))).toContain(9);
  });

  it("3語以上の禁止語が落ちる", () => {
    expect(itemsOf(withTaboo(["blue cat from", "a", "b", "c", "d"]))).toContain(9);
  });

  it("1語が長すぎる禁止語が落ちる", () => {
    expect(itemsOf(withTaboo(["a".repeat(16), "a", "b", "c", "d"]))).toContain(9);
  });

  it("2語の複合語は許す", () => {
    expect(itemsOf(withTaboo(["time machine", "robot", "cat", "pocket", "future"]))).toEqual([]);
  });
});

describe("検証2: 禁止語の重複", () => {
  it("大文字小文字だけが違う重複も落ちる", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    const head = first.taboo[0] as string;
    first.taboo = [head, head.toUpperCase(), ...first.taboo.slice(2)];
    expect(itemsOf(target)).toEqual([2]);
  });
});

describe("検証3: 禁止語の語数", () => {
  it("4語しか収録していないセットが落ちる", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.taboo = first.taboo.slice(0, 4);
    expect(itemsOf(target)).toEqual([3]);
  });
});

describe("検証4: 山札の枚数", () => {
  it("下限を1枚下回るセットが落ちる", () => {
    expect(itemsOf(validSet(MIN_CARDS - 1))).toEqual([4]);
  });

  it("下限ちょうどは通る", () => {
    expect(itemsOf(validSet(MIN_CARDS))).toEqual([]);
  });
});

describe("検証5: 制約カードの存在", () => {
  it("制約カードが1枚もないセットが落ちる", () => {
    const target = validSet();
    target.constraints = [];
    expect(itemsOf(target)).toEqual([5]);
  });
});

describe("検証6: 表示完全性", () => {
  it("keyExpressionsが空のセットが落ちる", () => {
    const target = validSet();
    target.keyExpressions = [];
    expect(itemsOf(target)).toEqual([6]);
  });
});

describe("検証7: 正解名の文字種", () => {
  it("数字を含む正解名が落ちる", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.answer = "Person1";
    expect(itemsOf(target)).toEqual([7]);
  });

  it("ハイフンとアポストロフィは許す", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.answer = "O'Brien-Smith";
    expect(itemsOf(target)).toEqual([]);
  });
});

describe("構造検証", () => {
  it("オブジェクトでない入力をschemaで落とす", () => {
    expect(itemsOf("not an object")).toEqual(["schema"]);
  });

  it("カードidの重複をschemaで落とす", () => {
    const target = validSet();
    target.cards = [card(1), card(1), ...target.cards.slice(2)];
    expect(itemsOf(target).every((item) => item === "schema")).toBe(true);
  });

  it("cardsが配列でない入力をschemaで落とす", () => {
    expect(itemsOf({ id: "x", title: "y", cards: {}, constraints: [], keyExpressions: [] })).toContain("schema");
  });
});

describe("反例出力", () => {
  it("セットid・カードid・検証項目の3欄を出す", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.taboo = [first.answer, ...first.taboo.slice(1)];
    const line = formatFinding(validateSet(target).findings[0] as never);
    expect(line).toContain("fixture_set_v1");
    expect(line).toContain("card_A");
    expect(line).toContain("検証1");
  });

  it("セット単位の項目はカード欄をセット全体と出す", () => {
    const target = validSet();
    target.constraints = [];
    const line = formatFinding(validateSet(target).findings[0] as never);
    expect(line).toContain("セット全体");
  });
});
