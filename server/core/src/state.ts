// RoomDOのstorage表現。公開Room型のスーパーセットとして持つ内部状態
import type { PinnedPair, Room } from "@beb/shared-core";

// configureで保存するゲーム固有設定。公開Room型(state配信)には含めない
export interface InternalRoomState extends Room {
  settings?: unknown;
}

export interface SecretsState {
  // 開示済みのresultペイロード。finished中の再接続と観戦開始で再送する。
  // stateブロードキャストには載せないため、公開状態ではなくこちら側に置く
  lastResult?: { gameId: string; payload: unknown };
  // playerId -> reconnectToken
  reconnectTokens: Record<string, string>;
  // kickで外した参加者のreconnectToken。この値でのjoinはkickedで止める（ADR-0028）。
  // 導入前に作られた部屋のsecretsには無いため省略可とし、無ければ空として扱う
  revokedTokens?: string[];
  // playerId -> 直近に配布したsecret.payload（再接続時の再送用）
  playerSecrets: Record<string, unknown>;
  // ゲームモジュールが保持する秘密状態。共通コアは中身を解釈しない（基本設計/01、ADR-0015）
  gameSecret?: unknown;
  // 裏画面で主催者が指定した「同じペアに入れる2人」の組。参加者に伏せるため room ではなくこちらに置く。
  // nextGameでも消さない。導入前に作られた部屋のsecretsには無いため省略可とし、無ければ指定なしとして扱う（ADR-0035）
  pinnedPairs?: PinnedPair[];
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
