// お題セットのスキーマ。このファイルの型定義がスキーマの正本である
// （基本設計/16_TWOHEADEDゲームモジュール.md の「コンテンツ形式」）。
//
// カードの形はDON'T SAY ITのカードから禁止語（taboo）を除いたものと同じである。
// ただしDON'T SAY ITのファイルは直接読まず、content/twoheaded/ に独自のセットを置く（16の「DON'T SAY ITのお題セットとの関係」）。

/** 1枚のお題 */
export interface Card {
  id: string;
  /** お題の名前。英字・空白・ハイフン・アポストロフィのみで、先頭は英字（16の検証2） */
  answer: string;
  /** お題の日本語名。説明役のペアにだけ配る（16の秘密情報） */
  ja: string;
  /** 広く通じる別名。説明役のペアはこれも言えない。省略時は無しとして扱う（16の「言えない語」） */
  aliases?: string[];
}

/** 英語の言い回しと日本語訳の組。書き出しの例と重要表現で同じ形を使う */
export interface KeyExpression {
  en: string;
  ja: string;
}

/** お題セット1本。content/twoheaded/<id>.json の中身 */
export interface TwoHeadedSet {
  id: string;
  title: string;
  cards: Card[];
  /** 説明の書き出しの例。各文が空欄（...）を含む（16の検証7） */
  starters: KeyExpression[];
  /** 結果で振り返る言い回し */
  keyExpressions: KeyExpression[];
}
