// 検証13項目それぞれについて、意図的に違反させたセットを用意し、その項目だけが落ちることを確かめる（09）
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
    first.taboo = ["time machine", "robot", "cat", "pocket", "future", ...first.taboo.slice(5)];
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
    first.taboo = ["mother", "brother", "honey", "bear", "forest", ...first.taboo.slice(5)];
    expect(itemsOf(target)).toEqual([]);
  });

  it("正解の語と完全一致する禁止語は拒否する", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.answer = "Winnie the Pooh";
    first.taboo = ["the", "honey", "bear", "forest", "piglet", ...first.taboo.slice(5)];
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
    first.taboo = [...taboo, ...first.taboo.slice(taboo.length)];
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

describe("検証10: 複合語の構成要素", () => {
  function withCard(answer: string, taboo: string[]) {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.answer = answer;
    first.taboo = [...taboo, ...first.taboo.slice(taboo.length)];
    return target;
  }

  it("正解の先頭に一致する禁止語が落ちる（raincoat に対する rain）", () => {
    expect(itemsOf(withCard("raincoat", ["rain", "wet", "hood", "plastic", "wear"]))).toContain(10);
  });

  it("正解の末尾に一致する禁止語が落ちる（rooftop に対する top）", () => {
    expect(itemsOf(withCard("rooftop", ["top", "building", "view", "wind", "above"]))).toContain(10);
  });

  it("複数形の禁止語も落ちる（bookshelf に対する books）", () => {
    expect(itemsOf(withCard("bookshelf", ["books", "wall", "wood", "rows", "tall"]))).toContain(10);
  });

  it("「〜するもの」の形も落ちる（hanger に対する hang）", () => {
    expect(itemsOf(withCard("hanger", ["hang", "closet", "wire", "shirt", "clothes"]))).toContain(10);
  });

  // 検証1の比較単位と同じ理由で、部分文字列一致は採らない。
  // 採ると無関係な語まで拒否し、書ける禁止語がなくなる（09の言えない語の範囲）
  it("先頭でも末尾でもない部分文字列は拒否しない（Katniss に対する cat）", () => {
    expect(itemsOf(withCard("Katniss Everdeen", ["cat", "arrow", "games", "braid", "district"]))).not.toContain(10);
  });

  it("2文字以下は構成要素として扱わない", () => {
    expect(itemsOf(withCard("Ed Sheeran", ["red hair", "singer", "guitar", "British", "songs"]))).not.toContain(10);
  });

  it("正解より長い禁止語は落ちない", () => {
    expect(itemsOf(withCard("pen", ["pencil", "write", "ink", "hold", "blue"]))).not.toContain(10);
  });
});

describe("検証11: 日本語名", () => {
  it("英語をそのまま複写した日本語名が落ちる", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.ja = "NameA";
    expect(itemsOf(target)).toContain(11);
  });

  it("片仮名だけの日本語名は通る", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.ja = "ネームエー";
    expect(itemsOf(target)).not.toContain(11);
  });

  it("空の日本語名はschemaで落ちる（検証11では二重に見ない）", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.ja = "";
    const items = itemsOf(target);
    expect(items).toContain("schema");
    expect(items).not.toContain(11);
  });
});

describe("検証12: 別名", () => {
  function withAliases(aliases: string[]) {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.aliases = aliases;
    return target;
  }

  it("別名を持たないカードは通る", () => {
    expect(itemsOf(validSet())).not.toContain(12);
  });

  it("英字以外を含む別名が落ちる", () => {
    expect(itemsOf(withAliases(["べつめい"]))).toContain(12);
  });

  it("3語以上の別名が落ちる", () => {
    expect(itemsOf(withAliases(["a very long name"]))).toContain(12);
  });

  it("上限を超える件数が落ちる", () => {
    expect(itemsOf(withAliases(["one", "two", "three", "four"]))).toContain(12);
  });

  it("別名の重複が落ちる", () => {
    expect(itemsOf(withAliases(["Fridge", "fridge"]))).toContain(12);
  });

  it("禁止語と重複する別名が落ちる", () => {
    expect(itemsOf(withAliases(["clueAA"]))).toContain(12);
  });

  it("正解の構成語と一致する別名が落ちる", () => {
    expect(itemsOf(withAliases(["NameA"]))).toContain(12);
  });

  it("正解と別の語である別名は通る", () => {
    expect(itemsOf(withAliases(["fridge", "icebox"]))).not.toContain(12);
  });
});

describe("検証13: 禁止語の枠の重複", () => {
  function withTaboo(taboo: string[]) {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.taboo = [...taboo, ...first.taboo.slice(taboo.length)];
    return target;
  }

  it("複合語の構成語が単独で禁止されている枠が落ちる", () => {
    // cheek が単独で禁止されていれば red cheek は絶対に言えないため、追加効果がない
    expect(itemsOf(withTaboo(["cheek", "red cheek"]))).toContain(13);
  });

  it("複合語の両方の語が別々に禁止されている枠も落ちる", () => {
    expect(itemsOf(withTaboo(["straight", "line", "straight line"]))).toContain(13);
  });

  it("複数形の違いだけの枠が落ちる", () => {
    expect(itemsOf(withTaboo(["boy", "boys"]))).toContain(13);
  });

  it("es の複数形も落ちる", () => {
    expect(itemsOf(withTaboo(["box", "boxes"]))).toContain(13);
  });

  // 語句の構成語と単独の禁止語の照合でも単複差を吸収する。
  // 完全一致だけで見ると `gloves` と `white glove` を見逃した（実測。573枚中7枠）
  it("複数形で禁止した語の単数形を含む複合語が落ちる", () => {
    expect(itemsOf(withTaboo(["gloves", "white glove"]))).toContain(13);
  });

  it("単数形で禁止した語の複数形を含む複合語も落ちる", () => {
    expect(itemsOf(withTaboo(["glove", "white gloves"]))).toContain(13);
  });

  it("es の複数形でも語句側を落とす", () => {
    expect(itemsOf(withTaboo(["boxes", "lunch box"]))).toContain(13);
  });

  it("構成語が単独で禁止されていない複合語は通る", () => {
    expect(itemsOf(withTaboo(["red cheek", "yellow"]))).not.toContain(13);
  });

  it("複合語どうしで語が重なるだけなら落とさない（単独では禁止されていない）", () => {
    // 単語だけを言う経路は塞がれていないため、どちらの枠にも役割がある
    expect(itemsOf(withTaboo(["red cheek", "red nose"]))).not.toContain(13);
  });

  // 不規則変化（children / child）は文字列比較では判定できないため検査対象外とする。
  // 語形変化を同じ語とみなす規則は卓の裁定に委ねる（09の禁止語の語形変化）
  it("不規則変化の重複は落とさない（検査の限界として明示）", () => {
    expect(itemsOf(withTaboo(["child", "children"]))).not.toContain(13);
  });
});

describe("検証14: 禁止語の語形変化による重複", () => {
  function withTaboo(taboo: string[]) {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.taboo = [...taboo, ...first.taboo.slice(taboo.length)];
    return target;
  }

  it("最上級だけが違う枠が落ちる", () => {
    // small が禁止なら smallest も言えない（実測。places の Vatican）
    expect(itemsOf(withTaboo(["small", "smallest"]))).toContain(14);
  });

  it("名詞と形容詞の派生が落ちる", () => {
    expect(itemsOf(withTaboo(["freedom", "free"]))).toContain(14);
  });

  it("動名詞の派生が落ちる（語末のeが落ちる形）", () => {
    expect(itemsOf(withTaboo(["giving", "give away"]))).toContain(14);
  });

  it("国名と国民形容詞が落ちる", () => {
    // 09の禁止語の語形変化が France と French を同じ語として扱う
    expect(itemsOf(withTaboo(["Spain", "Spanish"]))).toContain(14);
  });

  it("国名と国民形容詞は語句の構成語でも落ちる", () => {
    expect(itemsOf(withTaboo(["Korea", "Korean food"]))).toContain(14);
  });

  it("短縮形が落ちる", () => {
    expect(itemsOf(withTaboo(["photograph", "hand photo"]))).toContain(14);
  });

  it("単複差だけの重複は検証13が扱うため検証14では落とさない", () => {
    expect(itemsOf(withTaboo(["boy", "boys"]))).not.toContain(14);
  });

  it("語幹が3文字以下の対は落とさない（art と artist を別概念として残す）", () => {
    expect(itemsOf(withTaboo(["art", "artist"]))).not.toContain(14);
  });

  it("無関係な語の対は落とさない", () => {
    expect(itemsOf(withTaboo(["water", "mountain"]))).not.toContain(14);
  });
});

describe("検証15: 別名を構成する語と禁止語の重複", () => {
  function withAlias(taboo: string[], aliases: string[]) {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.taboo = [...taboo, ...first.taboo.slice(taboo.length)];
    first.aliases = aliases;
    return target;
  }

  it("別名の構成語が禁止語の枠にある場合に落ちる", () => {
    // 別名 chemist により chemist shop は言えない（実測。places の pharmacy）
    expect(itemsOf(withAlias(["chemist shop"], ["chemist"]))).toContain(15);
  });

  it("単複差でも落ちる", () => {
    // 完全一致だけで見ると movies と別名 movie theater を見逃す（実測）
    expect(itemsOf(withAlias(["movies"], ["movie theater"]))).toContain(15);
  });

  it("別名と語が重ならない禁止語は通る", () => {
    expect(itemsOf(withAlias(["window"], ["chemist"]))).not.toContain(15);
  });
});

describe("検証16: 綴りの統一", () => {
  function withTaboo(taboo: string[]) {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.taboo = [...taboo, ...first.taboo.slice(taboo.length)];
    return target;
  }

  it("英式の綴りが落ちる", () => {
    expect(itemsOf(withTaboo(["grey"]))).toContain(16);
  });

  it("複合語の構成語でも落ちる", () => {
    expect(itemsOf(withTaboo(["grey shirt"]))).toContain(16);
  });

  it("別名の英式の綴りも落ちる", () => {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.aliases = ["harbour"];
    expect(itemsOf(target)).toContain(16);
  });

  it("米式の綴りは通る", () => {
    expect(itemsOf(withTaboo(["gray", "harbor", "color"]))).not.toContain(16);
  });
});

describe("検証17: 同じ説明経路を塞ぐ語の重複", () => {
  function reportOf(taboo: string[]) {
    const target = validSet();
    const first = target.cards[0];
    if (first === undefined) {
      throw new Error("フィクスチャが空である");
    }
    first.taboo = [...taboo, ...first.taboo.slice(taboo.length)];
    return validateSet(target);
  }

  it("同義語の重複を警告として出す", () => {
    const report = reportOf(["soccer", "football"]);
    expect(report.findings.map((finding) => finding.item)).toContain(17);
    expect(report.findings.find((finding) => finding.item === 17)?.severity).toBe("warning");
  });

  it("警告はエラー件数に数えない。マージを止めないため", () => {
    const report = reportOf(["soccer", "football"]);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(1);
  });

  it("語句の構成語でも警告を出す", () => {
    expect(reportOf(["movies", "old film"]).findings.map((finding) => finding.item)).toContain(17);
  });

  it("king と queen は落とさない。片方を禁じてももう片方は別の人物を指して言える", () => {
    expect(reportOf(["king", "queen"]).findings.map((finding) => finding.item)).not.toContain(17);
  });

  it("無関係な語の対は警告を出さない", () => {
    expect(reportOf(["water", "mountain"]).findings.map((finding) => finding.item)).not.toContain(17);
  });
});
