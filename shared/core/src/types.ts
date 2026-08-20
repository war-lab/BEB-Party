// 共通コアの状態モデル。ゲーム固有の語彙を含まない（不変条件4、ADR-0009）
// 出典: 設計.md ランタイムデータモデル、基本設計/05_ゲームモジュール.md 状態モデル

export type Level = 1 | 2 | 3 | 4 | 5;

// 再接続用の秘密値は持たない。DO側の秘密状態でのみ保持する（ADR-0006）
export interface Player {
  id: string;
  name: string;
  level: Level;
  connected: boolean;
  isHost: boolean;
}

// 部屋単位の通算スコアに相当するフィールドは持たない（ADR-0011）
export interface Room {
  code: string;
  lifecycle: "lobby" | "playing" | "finished";
  players: Player[];
  gameId?: string;
  contentId?: string;
  stage?: string;
  deadline?: number;
  gameState?: unknown;
}

/**
 * ロビーで変更できる設定1件の記述子。
 *
 * 共通コアは `key` も `labelJa` も解釈せず、入力を描いて値を組み立てるだけとする。
 * ゲーム固有の設定名が共通コアへ入り込まないようにするための仕組みである（不変条件4、ADR-0009）。
 *
 * `min` / `max` は入力の当たり判定であって検証ではない。
 * 受理の可否はサーバの `validateSettings` が決める（ADR-0012）。
 */
export interface NumberSettingField {
  type: "number";
  /** settingsオブジェクトのキー。共通コアは中身を解釈しない */
  key: string;
  labelJa: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

/** 現在は数値のみ。selectやtoggleが要るゲームが出た時点で足す（先回りしない。基本設計/05） */
export type SettingField = NumberSettingField;

// GET /api/catalog で配るカタログの1エントリ
export interface GameSummary {
  id: string;
  title: string;
  /** 選択画面に出す1行の説明 */
  tagline: string;
  /** 選択画面のアイコン（絵文字） */
  icon: string;
  playerCount: [number, number];
  /** コンテンツ選択の見出し（例: 事件を選ぶ / お題を選ぶ） */
  contentLabelJa: string;
  /** ロビーで変更できる設定。空配列なら設定の入力を出さない */
  settingsFields: SettingField[];
  contents: ContentSummary[];
}

// コンテンツ(事件・お題セット等)の公開メタ情報。ゲーム固有のフィールドは
// 各ゲームモジュール側の型がこれを拡張して追加する（例: DETECTIVESのCaseSummary）
export interface ContentSummary {
  id: string;
  title: string;
}
