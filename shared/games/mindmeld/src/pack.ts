// お題パックのスキーマ。このファイルの型定義がスキーマの正本である
// （基本設計/15_MINDMELDゲームモジュール.md の「コンテンツ形式」）。
//
// お題の正解の語や答えの候補を書く欄を持たない。一致の判定はペアの2語の比較だけで決まる。

/** お題1件 */
export interface PromptSpec {
  id: string;
  en: string;
  ja: string;
}

/** カウントダウン・申告・異議・つなぎの理由の説明に使う言い回し */
export interface KeyExpression {
  en: string;
  ja: string;
}

/** お題パック1本。content/mindmeld/<id>.json の中身 */
export interface MindMeldPack {
  id: string;
  title: string;
  prompts: PromptSpec[];
  keyExpressions: KeyExpression[];
}
