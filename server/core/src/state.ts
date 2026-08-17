// RoomDOのstorage表現。公開Room型のスーパーセットとして持つ内部状態
import type { Room } from "@beb/shared-core";

// configureで保存するゲーム固有設定。公開Room型(state配信)には含めない
export interface InternalRoomState extends Room {
  settings?: unknown;
}

export interface SecretsState {
  // playerId -> reconnectToken
  reconnectTokens: Record<string, string>;
  // playerId -> 直近に配布したsecret.payload（再接続時の再送用）
  playerSecrets: Record<string, unknown>;
  // ゲームモジュールが保持する秘密状態。共通コアは中身を解釈しない（基本設計/01、ADR-0015）
  gameSecret?: unknown;
}

export function emptySecretsState(): SecretsState {
  return { reconnectTokens: {}, playerSecrets: {} };
}

// アラーム多重化用。DOアラームは1本しか持てないためmin(stageDeadline, expireAt)で管理する
export interface AlarmsState {
  stageDeadline?: number;
  expireAt: number;
}

// state配信用に公開Room型へ射影する（settingsを除く）
export function toPublicRoom(state: InternalRoomState): Room {
  const { settings: _settings, ...room } = state;
  return room;
}
