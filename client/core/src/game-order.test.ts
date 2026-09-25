import { describe, expect, it } from "vitest";
import { orderGamesByPlayerCount } from "./game-order";

const game = (id: string, min: number, max: number) => ({ id, playerCount: [min, max] as [number, number] });

const CATALOG = [game("five", 5, 6), game("duo", 2, 2), game("small", 2, 4), game("four", 4, 4), game("wide", 3, 6)];

const ids = (count: number) =>
  orderGamesByPlayerCount(CATALOG, count).map((entry) => `${entry.game.id}:${entry.playable ? "o" : "x"}`);

describe("orderGamesByPlayerCount", () => {
  // 遊べるゲームを上に寄せ、各グループの中でカタログ順が崩れないことを固定する
  it("遊べるゲームを上に、遊べないゲームを下に、それぞれカタログ順で並べる", () => {
    expect(ids(3)).toEqual(["small:o", "wide:o", "five:x", "duo:x", "four:x"]);
  });

  // 下限・上限ちょうどの人数を遊べる側に数えることを固定する（範囲外の判定の取り違えを防ぐ）
  it("対応人数の下限と上限ちょうどを遊べるに含める", () => {
    expect(ids(2)).toEqual(["duo:o", "small:o", "five:x", "four:x", "wide:x"]);
    expect(ids(6)).toEqual(["five:o", "wide:o", "duo:x", "small:x", "four:x"]);
  });

  // ホスト1人の部屋では全部が遊べない側になるが、一覧からは消えないことを固定する（絞り込みにしない）
  it("遊べるゲームが無くても全ゲームをカタログ順で返す", () => {
    expect(ids(1)).toEqual(["five:x", "duo:x", "small:x", "four:x", "wide:x"]);
  });
});
