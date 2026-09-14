import { describe, expect, it } from "vitest";
import { countWords, hasHintBlank, iconUrl, isValidIconId, isValidItemId, tierFor } from "./pack";

describe("iconUrl / isValidIconId", () => {
  it("配信元のパスを組み立てる", () => {
    expect(iconUrl("red_book")).toBe("/items/blindroom/red_book.svg");
  });

  it("ファイル名に使える形だけを受理する", () => {
    expect(isValidIconId("red_book")).toBe(true);
    expect(isValidIconId("Red_Book")).toBe(false);
    expect(isValidIconId("red book")).toBe(false);
    expect(isValidIconId("")).toBe(false);
  });
});

describe("isValidItemId", () => {
  it("小文字英数字とアンダースコアの16文字以内を受理する", () => {
    expect(isValidItemId("cat")).toBe(true);
    expect(isValidItemId("red_book_2")).toBe(true);
    expect(isValidItemId("a".repeat(16))).toBe(true);
  });

  it("大文字・記号・空文字・17文字以上を落とす", () => {
    expect(isValidItemId("Cat")).toBe(false);
    expect(isValidItemId("red-book")).toBe(false);
    expect(isValidItemId("")).toBe(false);
    expect(isValidItemId("a".repeat(17))).toBe(false);
  });
});

describe("tierFor", () => {
  it("レベル1〜2はeasy、3以上はstandardになる", () => {
    expect(tierFor(1)).toBe("easy");
    expect(tierFor(2)).toBe("easy");
    expect(tierFor(3)).toBe("standard");
    expect(tierFor(5)).toBe("standard");
  });
});

describe("hasHintBlank", () => {
  it("空欄を含む枠だけを受理する", () => {
    expect(hasHintBlank("Put the ... in the corner.")).toBe(true);
    expect(hasHintBlank("Put the cat in the corner.")).toBe(false);
  });
});

describe("countWords", () => {
  it("空白で区切った語数を数える", () => {
    expect(countWords("red book")).toBe(2);
    expect(countWords("  a  small   star ")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});
