// 受信値(unknown)を検証して共通メッセージ型を付ける。構造検証のみを行い、
// プロトコルバージョンの一致判定(unsupported_versionの送出)はサーバ側の責務とする
import type { Level } from "./types";
import type { ClientMessage } from "./protocol";

function isLevel(value: unknown): value is Level {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
      if (typeof raw.name !== "string" || !isLevel(raw.level)) {
        return null;
      }
      if (raw.reconnectToken !== undefined && typeof raw.reconnectToken !== "string") {
        return null;
      }
      return { v, type: "join", name: raw.name, level: raw.level, reconnectToken: raw.reconnectToken };
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
      return { ...payload, v, type: "action", action: raw.action };
    }
    default:
      return null;
  }
}
