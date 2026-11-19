// メッセージ構造(型)の正本。意味・受理条件・順序保証は基本設計/03_プロトコル.mdを正とする
import type { PlayerIconId } from "./player-icon";
import type { Level, PinnedPair, Room } from "./types";

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
  /**
   * 選んだアイコンのID。省略可とする。
   *
   * 旧SPAを開いたままのタブは本フィールドを送らないため、必須にすると
   * `invalid_payload` で参加できなくなる。サーバは省略時に既定値を割り当てる（基本設計/01）。
   */
  icon?: PlayerIconId;
  reconnectToken?: string;
}

export interface SpectateMessage {
  v: number;
  type: "spectate";
}

/**
 * 裏画面のソケットとして登録する（ADR-0035）。
 *
 * 参加者に数えず、`secret` を受け取らない。URLを知っていれば誰でも送れる（不変条件3の例外。ADR-0035）
 */
export interface BackstageMessage {
  v: number;
  type: "backstage";
}

/**
 * ペアの指定を丸ごと置き換える。空配列で指定をすべて外す（ADR-0035）。
 *
 * 裏画面のソケットからだけ受理する。`pairs` の playerId は組ませる対象の指定であって認証情報ではない
 */
export interface SetPinnedPairsMessage {
  v: number;
  type: "setPinnedPairs";
  pairs: PinnedPair[];
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

/**
 * ロビーでホストが切断中の参加者を外す（ADR-0028）。
 *
 * `playerId` は対象の指定であって認証情報ではない（ADR-0006が禁じる使い方に当たらない）。
 * 権限は送信元がホストのソケットであることで確かめる（ADR-0028）
 */
export interface KickMessage {
  v: number;
  type: "kick";
  playerId: string;
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
  | BackstageMessage
  | SetPinnedPairsMessage
  | SelectGameMessage
  | ConfigureMessage
  | StartMessage
  | NextGameMessage
  | KickMessage
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

/** ペアの指定の現在値。裏画面のソケットにだけ送る（ADR-0035） */
export interface PinnedPairsMessage {
  v: number;
  type: "pinnedPairs";
  pairs: PinnedPair[];
}

export interface ErrorMessage {
  v: number;
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage =
  | JoinedMessage
  | StateMessage
  | SecretMessage
  | ResultMessage
  | PinnedPairsMessage
  | ErrorMessage;
