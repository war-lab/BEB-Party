export { default as App } from "./App.svelte";
// 演出プリミティブ。ゲームモジュールが同じ見た目を組み立てるために使う（ビジュアルデザイン.md）
export { default as SecretCover } from "./components/SecretCover.svelte";
// 上部固定のタイマーバー。ステージ名と残り時間だけを描く（基本設計/02）
export { default as StageTimer } from "./components/StageTimer.svelte";
// 長い発話・議論のステージでスリープを抑止する（基本設計/02）
export { acquireWakeLock } from "./wake-lock.svelte";
export { connect, disconnect, sendAction, sendCommon } from "./connection";
export { faceColor } from "./face-color";
// 顔アイコンの画像。ゲーム画面はplayerIdしか持たないため共通コアが引く（ADR-0022）
export { playerIconImage, playerIconOf, type PlayerIconImage } from "./player-icon";
// 残り時間の算出。タイマーを出す画面はこれを使う（基本設計/02のタイマー表示）
export { createServerClock, formatClock, type ServerClock } from "./server-clock.svelte";

// 読み取り専用ストア。書き込みはconnection.ts(WebSocket受信)からのみ行う（基本設計/02_クライアント.md）
export { serverState } from "./stores/server-state.svelte";
export { secret } from "./stores/secret.svelte";
export { result } from "./stores/result.svelte";
export { ui } from "./stores/ui.svelte";
export type { ConnectionStatus } from "./stores/ui.svelte";
