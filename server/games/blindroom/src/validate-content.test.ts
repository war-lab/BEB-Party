// お題データ検証13項目。正常なパックを1項目だけ壊し、その項目だけが落ちることを確かめる
// （基本設計/12の検証項目）。
import { MIN_ITEMS, type BlindRoomPack } from "@beb/shared-blindroom";
import { describe, expect, it } from "vitest";
import { validItemSet, validPack } from "./test-support/fixtures";
import { formatFinding, validateContent, validatePack, type ValidationItem } from "./validate-content";

function itemsOf(pack: unknown): ValidationItem[] {
  return validatePack(pack).findings.map((finding) => finding.item);
}

/** 正常なパックへ1手だけ変更を加える */
function broken(mutate: (pack: BlindRoomPack) => void): BlindRoomPack {
  const pack = validPack();
  mutate(pack);
  return pack;
}

describe("正常なパック", () => {
  it("反例が出ない", () => {
    const report = validatePack(validPack());
    expect(report.findings.map(formatFinding)).toEqual([]);
    expect(report.errorCount).toBe(0);
    expect(validateContent(validPack()).valid).toBe(true);
  });
});

describe("構造検証", () => {
  it("オブジェクトでない値を落とす", () => {
    expect(itemsOf("pack")).toEqual(["schema"]);
  });

  it("必須欄の欠落を落とす", () => {
    const pack = validPack() as unknown as Record<string, unknown>;
    delete pack.title;
    expect(itemsOf(pack)).toContain("schema");
  });

  it("見本の盤面が書かれていたら落とす（ADR-0024）", () => {
    const pack = { ...validPack(), samples: [] };
    expect(itemsOf(pack)).toContain("schema");
  });

  it("tierが未知の値なら落とす", () => {
    const pack = validPack() as unknown as { itemSets: { tier: string }[] };
    const first = pack.itemSets[0];
    if (first) {
      first.tier = "hard";
    }
    expect(itemsOf(pack)).toContain("schema");
  });
});

describe("検証2: 段の網羅", () => {
  it("standardのセットが無いと落ちる", () => {
    const pack = broken((target) => {
      target.itemSets = [validItemSet("easy")];
    });
    expect(itemsOf(pack)).toContain(2);
  });

  it("easyのセットが無いと落ちる", () => {
    const pack = broken((target) => {
      target.itemSets = [validItemSet("standard")];
    });
    expect(itemsOf(pack)).toContain(2);
  });
});

describe("検証3: アイテム数", () => {
  it("下限未満で落ちる", () => {
    const pack = broken((target) => {
      target.itemSets = [validItemSet("easy", MIN_ITEMS - 1), validItemSet("standard")];
    });
    expect(itemsOf(pack)).toEqual([3]);
  });
});

describe("検証4・5: idの一意性", () => {
  it("itemIdがセットをまたいで重複すると落ちる", () => {
    const pack = broken((target) => {
      const item = target.itemSets[1]?.items[0];
      if (item) {
        item.id = "easy_1";
      }
    });
    expect(itemsOf(pack)).toEqual([4]);
  });

  it("アイテムセットidが重複すると落ちる", () => {
    const pack = broken((target) => {
      const set = target.itemSets[1];
      if (set) {
        set.id = "set_easy";
      }
    });
    expect(itemsOf(pack)).toContain(5);
  });
});

describe("検証6: itemIdの文字種と長さ", () => {
  it("大文字・記号・17文字以上で落ちる", () => {
    for (const id of ["Easy_1", "easy-1", "e".repeat(17)]) {
      const pack = broken((target) => {
        const item = target.itemSets[0]?.items[0];
        if (item) {
          item.id = id;
        }
      });
      expect(itemsOf(pack)).toContain(6);
    }
  });
});

describe("検証7・8: アイコン", () => {
  it("ファイル名に使えないiconで落ちる", () => {
    for (const icon of ["Red_Book", "red-book", "red book", "i".repeat(17)]) {
      const pack = broken((target) => {
        const item = target.itemSets[0]?.items[0];
        if (item) {
          item.icon = icon;
        }
      });
      expect(itemsOf(pack)).toContain(7);
    }
  });

  it("同一セット内でiconが重複すると落ちる", () => {
    const pack = broken((target) => {
      const set = target.itemSets[0];
      const first = set?.items[0];
      const second = set?.items[1];
      if (first && second) {
        second.icon = first.icon;
      }
    });
    expect(itemsOf(pack)).toEqual([8]);
  });
});

describe("検証9: アイテムの英語名", () => {
  it("同一セット内でenが重複すると落ちる", () => {
    const pack = broken((target) => {
      const set = target.itemSets[0];
      const first = set?.items[0];
      const second = set?.items[1];
      if (first && second) {
        second.en = first.en;
      }
    });
    expect(itemsOf(pack)).toContain(9);
  });

  it("4語以上のenで落ちる", () => {
    const pack = broken((target) => {
      const item = target.itemSets[0]?.items[0];
      if (item) {
        item.en = "a very long name";
      }
    });
    expect(itemsOf(pack)).toEqual([9]);
  });
});

describe("検証10・11: 説明者の言い回し", () => {
  it("4件未満で落ちる", () => {
    const pack = broken((target) => {
      const set = target.itemSets[0];
      if (set) {
        set.describerHints = set.describerHints.slice(0, 3);
      }
    });
    expect(itemsOf(pack)).toEqual([10]);
  });

  it("空欄を含まない完成文で落ちる", () => {
    const pack = broken((target) => {
      const set = target.itemSets[0];
      if (set) {
        set.describerHints = [...set.describerHints.slice(1), "Put the cat in the corner."];
      }
    });
    expect(itemsOf(pack)).toEqual([11]);
  });
});

describe("検証12・13: パック直下", () => {
  it("keyExpressionsが3件未満で落ちる", () => {
    const pack = broken((target) => {
      target.keyExpressions = target.keyExpressions.slice(0, 2);
    });
    expect(itemsOf(pack)).toEqual([12]);
  });

  it("jaが空白のみで落ちる", () => {
    const pack = broken((target) => {
      const item = target.itemSets[0]?.items[0];
      if (item) {
        item.ja = "   ";
      }
    });
    expect(itemsOf(pack)).toEqual([13]);
  });
});

describe("validateContent", () => {
  it("反例を整形した理由を返す", () => {
    const pack = broken((target) => {
      target.keyExpressions = [];
    });
    const result = validateContent(pack);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("検証12");
  });
});
