// メッセージ構造(型)の正本。意味・受理条件・順序保証は基本設計/03_プロトコル.mdを正とする
import type { Level, Room } from "./types";

export const PROTOCOL_VERSION = 1;

// ハートビートの固定文字列。03の表の値と1文字も違えてはならない。
// setWebSocketAutoResponse()へそのまま登録するため、オブジェクトを組み立てて
// JSON.stringifyした結果に依存させない(サーバ側の利用箇所でも本定数をそのまま使う)
export const HEARTBEAT_PING = '{"v":1,"type":"ping"}';
export const HEARTBEAT_PONG = '{"v":1,"type":"pong"}';

// C→S 共通メッセージ(ゲームIDによらず共通コアが解釈する)
export interface JoinMessage {
  v: number;
  type: "join";
  name: string;
  level: Level;
  reconnectToken?: string;
}

export interface SpectateMessage {
  v: number;
  type: "spectate";
}

export interface SelectGameMessage {
  v: number;
  type: "selectGame";
  gameId: string;
}

export interface ConfigureMessage {
  v: number;
  type: "configure";
  contentId?: string;
  settings?: unknown;
}

export interface StartMessage {
  v: number;
  type: "start";
}

export interface NextGameMessage {
  v: number;
  type: "nextGame";
}

// C→S ゲーム固有メッセージ。中身は`action`と追加payloadのみで、
// 共通コアは`action`文字列を見てGameModuleへディスパッチするだけで中身を解釈しない
export interface ActionMessage {
  v: number;
  type: "action";
  action: string;
  [key: string]: unknown;
}

export type ClientMessage =
  | JoinMessage
  | SpectateMessage
  | SelectGameMessage
  | ConfigureMessage
  | StartMessage
  | NextGameMessage
  | ActionMessage;

// S→C
export interface JoinedMessage {
  v: number;
  type: "joined";
  playerId: string;
  reconnectToken: string;
}

// 共通Room状態(gameStateを含む)の全量スナップショット + serverNow
export interface StateMessage extends Room {
  v: number;
  type: "state";
  serverNow: number;
}

// payloadの中身はゲームモジュールが定義する。共通コアはunknownのまま透過的に運ぶ
export interface SecretMessage {
  v: number;
  type: "secret";
  gameId: string;
  payload: unknown;
}

export interface ResultMessage {
  v: number;
  type: "result";
  gameId: string;
  payload: unknown;
}

export interface ErrorMessage {
  v: number;
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage = JoinedMessage | StateMessage | SecretMessage | ResultMessage | ErrorMessage;
