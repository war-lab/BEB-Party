// お題データのスキーマ。このファイルの型定義がスキーマの正本である（基本設計/11_WHOWROTETHISゲームモジュール.md）。
// 検証は件数・一意性・語数の計数だけで足りる。英文の意味を判定しない（不変条件1）。

/** 指名の議論に使う言い回し。質問に依存しないためパック直下に持つ（11のコンテンツ形式） */
export interface KeyExpression {
  en: string;
  ja: string;
}

/** 1ラウンド分の質問 */
export interface Question {
  id: string;
  /** 全員へ公開する質問文。`?` で終わる（11の検証4） */
  en: string;
  /** 意味の取り違えを防ぐ日本語文 */
  ja: string;
  /**
   * 英文を書くときに使える言い回しの例。
   *
   * レベル1〜2へ3件、レベル3以上へ1件を渡す（11のレベル差の吸収）。
   * 収録は3件以上とし、渡す件数だけをレベルで変える。
   */
  hintEn: string[];
}

/** お題パック1本。content/whowrotethis/<id>.json の中身。ロビーで選ぶ単位はパックである */
export interface WhoWroteThisPack {
  id: string;
  title: string;
  keyExpressions: KeyExpression[];
  questions: Question[];
}

/**
 * パックが持つ質問数の下限。
 *
 * 1ゲームで2問使うため、抽選に選択の余地が残る最小の件数である。
 * 同じ部屋で2ゲーム続けたときの重複はこの下限では防げない（nextGameでgameSecretが
 * 破棄され、使用済みidを持ち越す口がない。11のコンテンツ形式）。
 */
export const MIN_QUESTIONS = 4;

/** 1問が持つ hintEn の下限。レベル1〜2へ3件渡す設計に合わせる（11の検証6） */
export const MIN_HINTS = 3;

/** パックが持つ keyExpressions の下限（11の検証8） */
export const MIN_KEY_EXPRESSIONS = 3;

/**
 * hintEn の空欄を表す記号（11の検証10）。
 *
 * hintEn は完成した回答文にしない。`hintEn` は全員へ先頭から配られ（レベル1〜2は3件）、
 * 検証7が4語以上を保証するためそのまま提出できる合法な文になる。完成文を置くと、
 * 質問の内容とは独立に複数人が同一の提出を出す経路ができる。
 */
export const HINT_BLANK = "...";

/** hintEn が空欄を含むか（完成した回答文になっていないか） */
export function hasHintBlank(hint: string): boolean {
  return hint.includes(HINT_BLANK);
}
