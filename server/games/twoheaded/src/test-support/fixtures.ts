// 検証テストとモジュールテスト用のお題セット。
// 本番のセットとして扱われないよう content/ の外に置く（16のテスト観点）。
//
// 基準となる正常なセット（validSet）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import { fallbackPlayerIconId, type Level, type Player } from "@beb/shared-core";
import { MIN_CARDS, type Card, type TwoHeadedSet } from "@beb/shared-twoheaded";

/** 0始まりの番号を英字だけの名前にする（a, b, …, z, ba, bb, …）。answer の文字種（検証2）を満たす */
function lettersOf(index: number): string {
  let rest = index;
  let word = "";
  do {
    word = String.fromCharCode(97 + (rest % 26)) + word;
    rest = Math.floor(rest / 26);
  } while (rest > 0);
  return word;
}

export function validCards(count: number = MIN_CARDS): Card[] {
  return Array.from({ length: count }, (_, index) => {
    const card: Card = {
      id: `card_${String(index + 1).padStart(3, "0")}`,
      answer: `thing ${lettersOf(index)}`,
      ja: `もの${index + 1}`,
    };
    // 3枚に1枚だけ別名を持たせる。別名の有無の両方を通す
    if (index % 3 === 0) {
      card.aliases = [`other ${lettersOf(index)}`];
    }
    return card;
  });
}

export function validSet(count: number = MIN_CARDS): TwoHeadedSet {
  return {
    id: "fixture_set_v1",
    title: "テスト用のお題",
    cards: validCards(count),
    starters: [
      { en: "It is a ...", ja: "それは…です" },
      { en: "You use it to ...", ja: "…するのに使う" },
      { en: "You can find it in ...", ja: "…にある" },
    ],
    keyExpressions: [{ en: "Two words!", ja: "2語言った！" }],
  };
}

/** 参加者。全員つながっている状態で作る。レベルは levels で与える（既定は1〜5の繰り返し） */
export function playersOf(count: number, levels?: readonly Level[]): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player${index + 1}`,
    level: levels?.[index] ?? (((index % 5) + 1) as Level),
    icon: fallbackPlayerIconId(`p${index + 1}`),
    connected: true,
    isHost: index === 0,
  }));
}
