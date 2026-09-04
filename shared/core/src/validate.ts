// 受信値(unknown)を検証して共通メッセージ型を付ける。構造検証のみを行い、
// プロトコルバージョンの一致判定(unsupported_versionの送出)はサーバ側の責務とする
import type { Level } from "./types";
import type { ClientMessage } from "./protocol";
import { isPlayerIconId } from "./player-icon";

function isLevel(value: unknown): value is Level {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 表示名の長さ上限。stateブロードキャストに毎回載るため、共通コアが範囲を検証する（基本設計/01） */
export const NAME_MAX_LENGTH = 24;
/** ゲーム固有設定のシリアライズ長（文字数）の上限。中身の意味は各ゲームが検証する（ADR-0012） */
export const SETTINGS_MAX_CHARS = 2048;
/**
 * actionの残余ペイロードのシリアライズ長（文字数）の上限（ADR-0023）。
 *
 * 自由英文を運ぶゲームでは、提出テキストがgameSecretへ蓄積され、開示時に公開状態と
 * resultを経由して全員へ再配信される。1件の入力が以後の配信量を増幅する構造はnameと
 * 同じであり、器の側が上限を持つ。settingsより小さいのは、settingsがロビーで1回だけ
 * 送られるのに対しactionはゲーム中に繰り返し送られるためである。
 *
 * ゲームのルールとして適切な長さ（提出の文字数等）はゲームモジュールが別に検証する。
 */
export const ACTION_MAX_CHARS = 512;

function isValidName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && [...value].length <= NAME_MAX_LENGTH;
}

/** シリアライズ長で上限を課す。循環参照など文字列化できない値も弾く */
function isWithinSerializedLimit(value: unknown, maxChars: number): boolean {
  if (value === undefined) {
    return true;
  }
  try {
    return (JSON.stringify(value) ?? "").length <= maxChars;
  } catch {
    return false;
  }
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (typeof raw.v !== "number" || typeof raw.type !== "string") {
    return null;
  }
  const v = raw.v;

  switch (raw.type) {
    case "join": {
      if (!isValidName(raw.name) || !isLevel(raw.level)) {
        return null;
      }
      // 未指定は受理する（旧SPAの互換）。指定があるなら一覧に無いIDは弾く
      const icon = raw.icon;
      if (icon !== undefined && !isPlayerIconId(icon)) {
        return null;
      }
      if (raw.reconnectToken !== undefined && typeof raw.reconnectToken !== "string") {
        return null;
      }
      return {
        v,
        type: "join",
        name: raw.name.trim(),
        level: raw.level,
        icon,
        reconnectToken: raw.reconnectToken,
      };
    }
    case "spectate": {
      return { v, type: "spectate" };
    }
    case "selectGame": {
      if (typeof raw.gameId !== "string") {
        return null;
      }
      return { v, type: "selectGame", gameId: raw.gameId };
    }
    case "configure": {
      if (raw.contentId !== undefined && typeof raw.contentId !== "string") {
        return null;
      }
      if (!isWithinSerializedLimit(raw.settings, SETTINGS_MAX_CHARS)) {
        return null;
      }
      return { v, type: "configure", contentId: raw.contentId, settings: raw.settings };
    }
    case "start": {
      return { v, type: "start" };
    }
    case "nextGame": {
      return { v, type: "nextGame" };
    }
    case "action": {
      if (typeof raw.action !== "string") {
        return null;
      }
      const { v: _v, type: _type, action: _action, ...payload } = raw;
      // 残余ペイロードのサイズだけを見る。中身の意味はゲームモジュールが検証する（ADR-0023）
      if (!isWithinSerializedLimit(payload, ACTION_MAX_CHARS)) {
        return null;
      }
      return { ...payload, v, type: "action", action: raw.action };
    }
    default:
      return null;
  }
}
