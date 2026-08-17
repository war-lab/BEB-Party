export { default as App } from "./App.svelte";
export { connect, disconnect, sendAction, sendCommon } from "./connection";
export { faceColor } from "./face-color";

// 読み取り専用ストア。書き込みはconnection.ts(WebSocket受信)からのみ行う（基本設計/02_クライアント.md）
export { serverState } from "./stores/server-state.svelte";
export { secret } from "./stores/secret.svelte";
export { result } from "./stores/result.svelte";
export { ui } from "./stores/ui.svelte";
export type { ConnectionStatus } from "./stores/ui.svelte";
