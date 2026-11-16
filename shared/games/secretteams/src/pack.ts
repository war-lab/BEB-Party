// テーマパックのスキーマ。このファイルの型定義がスキーマの正本である
// （基本設計/17_SECRETTEAMSゲームモジュール.md の「コンテンツ形式」）。
//
// どのテーマも、ゲームごとに本物のテーマにも近いテーマにもなる。このため、すべてのテーマが単語を持つ。

/** 単語1件。配った人が英語で遠回しに説明する */
export interface WordCard {
  en: string;
  ja: string;
}

/** テーマ1件。同じ系統の中の他のテーマが、選択肢では「近いテーマ」として並ぶ */
export interface ThemeSpec {
  id: string;
  en: string;
  ja: string;
  words: WordCard[];
}

/** 系統。意味の近いテーマのまとまり（water に Ocean / River / Lake を置くなど） */
export interface FamilySpec {
  id: string;
  themes: ThemeSpec[];
}

/** 説明の型・質問と返事の型・味方の推測を言う型 */
export interface KeyExpression {
  en: string;
  ja: string;
}

/** テーマパック1本。content/secretteams/<id>.json の中身 */
export interface SecretTeamsPack {
  id: string;
  title: string;
  keyExpressions: KeyExpression[];
  families: FamilySpec[];
}
