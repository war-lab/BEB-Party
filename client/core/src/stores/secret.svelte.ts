// secretメッセージのpayload(自分だけに配られた情報)。WebSocket受信からのみ書き込む
interface SecretValue {
  gameId: string | null;
  payload: unknown;
}

const state = $state<SecretValue>({ gameId: null, payload: null });

export const secret: Readonly<SecretValue> = state;

// WebSocket受信時にのみ呼ぶ。connection.tsの外から呼ばない
export function setSecret(gameId: string, payload: unknown): void {
  state.gameId = gameId;
  state.payload = payload;
}

export function clearSecret(): void {
  state.gameId = null;
  state.payload = null;
}
