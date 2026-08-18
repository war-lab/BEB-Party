// お題データのスキーマ。このファイルの型定義がスキーマの正本である（基本設計/09_DONTSAYITゲームモジュール.md）。
// 推論エンジンを使わないため、検証は文字列比較と枚数の計数だけで足りる。

/** 1枚のお題。正解の人物名と、それを説明するときに使えない語の組 */
export interface Card {
  id: string;
  /** 正解の人物名。英字・空白・ハイフン・アポストロフィのみ */
  answer: string;
  /**
   * 禁止語。常に5語を収録する。
   *
   * 正解に強く結びつく順に並べる。レベル1〜2の説明者には先頭3語だけを提示するため、
   * 並び順が難度を決める（09のレベル差の吸収）。
   */
  taboo: string[];
}

/** 説明の仕方に条件を足すカード。案17 CHARADES+ を統合した要素であり、レベル5の説明者にだけ配る */
export interface ConstraintCard {
  id: string;
  ja: string;
  en: string;
}

export interface KeyExpression {
  en: string;
  ja: string;
}

/** お題セット1本。content/dontsayit/<id>.json の中身 */
export interface TabooSet {
  id: string;
  title: string;
  cards: Card[];
  constraints: ConstraintCard[];
  keyExpressions: KeyExpression[];
}

/** 1枚に収録する禁止語の数。提示数はレベルで変えるが、収録数は固定する（09の検証3） */
export const TABOO_PER_CARD = 5;

/**
 * 山札の下限枚数。
 *
 * 1ラウンドの最大消費枚数は「カードを送れる回数の上限5回」＋「締切時に捨てる表示中の1枚」＝6枚である。
 * 対応人数の上限6人が全員説明者を務められるよう、6×6=36枚を下限とする。
 *
 * 締切時の1枚を数え落とすと、最後の説明者に順番が回らない山札が検証を通る（09の検証4）。
 */
export const MIN_CARDS = 36;
