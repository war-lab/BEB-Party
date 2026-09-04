// resultメッセージのpayload(勝敗と開示内容)。WebSocket受信からのみ書き込む
interface ResultValue {
  gameId: string | null;
  payload: unknown;
}

const state = $state<ResultValue>({ gameId: null, payload: null });

export const result: Readonly<ResultValue> = state;

// WebSocket受信時にのみ呼ぶ。connection.tsの外から呼ばない
export function setResult(gameId: string, payload: unknown): void {
  state.gameId = gameId;
  state.payload = payload;
}

export function clearResult(): void {
  // 空のときは書き込まない。stateの受信ごとに呼ばれるため、毎回書くと
  // resultを読むコンポーネントが state 1件ごとに再描画される（E2Eが負荷で落ちた）
  if (state.gameId === null && state.payload === null) {
    return;
  }
  state.gameId = null;
  state.payload = null;
}
