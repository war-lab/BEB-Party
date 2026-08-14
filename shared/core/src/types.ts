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

// GET /api/catalog で配るカタログの1エントリ
export interface GameSummary {
  id: string;
  title: string;
  playerCount: [number, number];
  contents: ContentSummary[];
}

// コンテンツ(事件・お題セット等)の公開メタ情報。ゲーム固有のフィールドは
// 各ゲームモジュール側の型がこれを拡張して追加する（例: DETECTIVESのCaseSummary）
export interface ContentSummary {
  id: string;
  title: string;
}
