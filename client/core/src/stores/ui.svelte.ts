// 接続状態・入力中の値・演出の進行。クライアント内のみで完結する（サーバへは送らない）
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

interface UiValue {
  connectionStatus: ConnectionStatus;
  lastErrorCode: string | null;
  // joinedメッセージで判明する自分の公開ID。ホスト判定等クライアント側の表示にのみ使う
  myPlayerId: string | null;
}

export const ui = $state<UiValue>({ connectionStatus: "disconnected", lastErrorCode: null, myPlayerId: null });
