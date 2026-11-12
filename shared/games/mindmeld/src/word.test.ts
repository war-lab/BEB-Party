// 語の正規化・照合キー・近い語（基本設計/15のテスト観点「正規化」「照合キー」「近い語」）
import { describe, expect, it } from "vitest";
import { checkWord, editDistance, isNearKeys, matchKeyOf, normalizeWord, promptKeysOf } from "./word";

function keyOf(raw: string): string {
  const checked = checkWord(raw);
  if (!checked.ok) {
    throw new Error(`表示形の条件を満たさない: ${raw}`);
  }
  return checked.key;
}

describe("normalizeWord", () => {
  it("全角の英字をNFKCで半角へ寄せ、小文字にする", () => {
    expect(normalizeWord("ＣＯＯＫ")).toBe("cook");
    expect(normalizeWord("Japan")).toBe("japan");
  });

  it("曲がった ' を直線へ置き換える", () => {
    expect(normalizeWord("Rock’n’roll")).toBe("rock'n'roll");
  });

  it("前後の記号と空白を落とす。中の区切りは残す", () => {
    expect(normalizeWord("  cook!  ")).toBe("cook");
    expect(normalizeWord('"cook"')).toBe("cook");
    expect(normalizeWord("cook !")).toBe("cook");
    expect(normalizeWord("ice-cream.")).toBe("ice-cream");
    expect(normalizeWord("ice   cream")).toBe("ice cream");
  });

  it("書式制御文字（ゼロ幅空白）を取り除く", () => {
    expect(normalizeWord("co​ok")).toBe("cook");
  });

  it("前後のかなは落とさない（かなを含む提出を英語の語として受けない）", () => {
    expect(normalizeWord("catねこ")).toBe("catねこ");
  });
});

describe("checkWord", () => {
  it("正規化した表示形と照合キーを返す", () => {
    expect(checkWord(" Ice-Cream! ")).toEqual({ ok: true, display: "ice-cream", key: "icecream" });
    expect(checkWord("Ｂａｎａｎａ")).toEqual({ ok: true, display: "banana", key: "banana" });
  });

  it("かなを含む語、数字を含む語は英字以外の文字として落とす", () => {
    expect(checkWord("ねこ")).toMatchObject({ ok: false, problem: "letters" });
    expect(checkWord("catねこ")).toMatchObject({ ok: false, problem: "letters" });
    expect(checkWord("7up")).toMatchObject({ ok: false, problem: "letters" });
  });

  it("記号だけの提出は空として落とす", () => {
    expect(checkWord("!!")).toMatchObject({ ok: false, problem: "empty" });
    expect(checkWord("   ")).toMatchObject({ ok: false, problem: "empty" });
  });

  it("3要素以上の語を落とす", () => {
    expect(checkWord("ice cream cone")).toMatchObject({ ok: false, problem: "parts" });
    expect(checkWord("ice cream")).toMatchObject({ ok: true });
  });

  it("24文字を超える語を落とし、24文字ちょうどは受ける", () => {
    // 照合キーが20文字以下に収まるよう、区切りを含めて24文字にする
    const exactly24 = "abcd-e-fghij-klmno pqrst";
    expect([...exactly24].length).toBe(24);
    expect(checkWord(exactly24)).toMatchObject({ ok: true });
    expect(checkWord(`${exactly24}w`)).toMatchObject({ ok: false, problem: "length" });
  });

  it("照合キーが1文字の語と21文字以上の語を落とし、2文字と20文字は受ける", () => {
    expect(checkWord("a")).toMatchObject({ ok: false, problem: "key_length" });
    expect(checkWord("a-")).toMatchObject({ ok: false, problem: "key_length" });
    expect(checkWord("ox")).toMatchObject({ ok: true, key: "ox" });
    expect(checkWord("a".repeat(20))).toMatchObject({ ok: true });
    expect(checkWord("a".repeat(21))).toMatchObject({ ok: false, problem: "key_length" });
  });
});

describe("照合キー", () => {
  it("ice cream / ice-cream / icecream が同じ照合キーになる", () => {
    expect(keyOf("ice cream")).toBe("icecream");
    expect(keyOf("ice-cream")).toBe("icecream");
    expect(keyOf("icecream")).toBe("icecream");
  });

  it("アポストロフィも落とす", () => {
    expect(matchKeyOf("we'll")).toBe("well");
  });
});

describe("promptKeysOf", () => {
  it("お題の語を照合キーにし、1文字の語と重複を除く", () => {
    expect(promptKeysOf("Something in a kitchen")).toEqual(["something", "in", "kitchen"]);
    expect(promptKeysOf("What's in your bag, and in your desk?")).toEqual([
      "whats",
      "in",
      "your",
      "bag",
      "and",
      "desk",
    ]);
  });
});

describe("editDistance", () => {
  it("挿入・削除・置換の最小回数", () => {
    expect(editDistance("color", "colour")).toBe(1);
    expect(editDistance("theater", "theatre")).toBe(2);
    expect(editDistance("knife", "knives")).toBe(2);
    expect(editDistance("mouse", "mice")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });
});

describe("isNearKeys", () => {
  it("本文の例は近い語になる", () => {
    for (const [a, b] of [
      ["apple", "apples"],
      ["bus", "buses"],
      ["child", "children"],
      ["color", "colour"],
      ["theater", "theatre"],
      ["knife", "knives"],
      ["man", "men"],
      // 別の語も門は通る。同じ語かどうかは申告と異議で人が決める（ADR-0034）
      ["cat", "car"],
      ["new", "news"],
    ] as const) {
      expect(isNearKeys(a, b), `${a}/${b}`).toBe(true);
      expect(isNearKeys(b, a), `${b}/${a}`).toBe(true);
    }
  });

  it("明らかに違う語、不規則な複数形、2文字の語どうしは近い語にならない", () => {
    expect(isNearKeys("pan", "cook")).toBe(false);
    expect(isNearKeys("mouse", "mice")).toBe(false);
    expect(isNearKeys("foot", "feet")).toBe(false);
    expect(isNearKeys("go", "to")).toBe(false);
    expect(isNearKeys("ox", "oxen")).toBe(false);
  });

  it("照合キーが一致する組は近い語ではない", () => {
    expect(isNearKeys("apple", "apple")).toBe(false);
  });

  it("先頭部分の差は3まで近い語で、4は近い語でない", () => {
    expect(isNearKeys("cat", "catchy")).toBe(true);
    expect(isNearKeys("cat", "catalog")).toBe(false);
  });

  it("編集距離2は短い方が5文字以上のときだけ近い語", () => {
    // 4文字どうしで編集距離2
    expect(editDistance("cake", "bike")).toBe(2);
    expect(isNearKeys("cake", "bike")).toBe(false);
    // 5文字どうしで編集距離2
    expect(editDistance("house", "morse")).toBe(2);
    expect(isNearKeys("house", "morse")).toBe(true);
    // 編集距離3は5文字以上でも近い語でない
    expect(editDistance("table", "cabin")).toBe(3);
    expect(isNearKeys("table", "cabin")).toBe(false);
  });

  it("短い方が3文字未満なら、編集距離1でも近い語でない", () => {
    expect(isNearKeys("am", "ham")).toBe(false);
  });
});
