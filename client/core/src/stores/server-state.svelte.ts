// stateメッセージの最新スナップショット。WebSocket受信からのみ書き込む（禁止事項: 楽観更新をしない）
import type { Room } from "@beb/shared-core";

interface ServerStateValue {
  room: Room | null;
  serverNow: number | null;
}

const state = $state<ServerStateValue>({ room: null, serverNow: null });

// 読み取り専用として公開する
export const serverState: Readonly<ServerStateValue> = state;

// WebSocket受信時にのみ呼ぶ。connection.tsの外から呼ばない
export function setServerState(room: Room, serverNow: number): void {
  state.room = room;
  state.serverNow = serverNow;
}

export function clearServerState(): void {
  state.room = null;
  state.serverNow = null;
}
