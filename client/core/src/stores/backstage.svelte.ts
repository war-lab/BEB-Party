// 裏画面が受け取ったペアの指定の現在値（ADR-0035）。WebSocket受信からのみ書き込む（楽観更新をしない）。
// 参加者の端末には pinnedPairs が届かないため、裏画面以外では null のまま変わらない
import type { PinnedPair } from "@beb/shared-core";

interface BackstageValue {
  pinnedPairs: PinnedPair[] | null;
}

const state = $state<BackstageValue>({ pinnedPairs: null });

// 読み取り専用として公開する
export const backstage: Readonly<BackstageValue> = state;

// WebSocket受信時にのみ呼ぶ。connection.tsの外から呼ばない
export function setPinnedPairs(pairs: PinnedPair[]): void {
  state.pinnedPairs = pairs;
}

export function clearPinnedPairs(): void {
  state.pinnedPairs = null;
}
