// RoomDOのvitest-pool-workersテスト共通ヘルパー
import { env } from "cloudflare:workers";
import type { ServerMessage } from "@beb/shared-core";

export function uniqueRoomCode(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function getStub(code: string) {
  return env.ROOM_DO.get(env.ROOM_DO.idFromName(code));
}

export async function createRoom(code: string): Promise<ReturnType<typeof getStub>> {
  const stub = getStub(code);
  const response = await stub.fetch("https://room-do/init", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error(`room init failed with status ${response.status}`);
  }
  return stub;
}

export async function upgradeToWebSocket(stub: ReturnType<typeof getStub>): Promise<Response> {
  return stub.fetch("https://room-do/ws", { headers: { Upgrade: "websocket" } });
}

export async function openSocket(stub: ReturnType<typeof getStub>): Promise<WebSocket> {
  const response = await upgradeToWebSocket(stub);
  const ws = response.webSocket;
  if (!ws) {
    throw new Error(`expected websocket response, got status ${response.status}`);
  }
  ws.accept();
  return ws;
}

function parseMessage(event: MessageEvent): ServerMessage {
  const raw = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
  return JSON.parse(raw) as ServerMessage;
}

// count件のメッセージを受信するまで待つ(順序を保持)
export function collectMessages(ws: WebSocket, count: number, timeoutMs = 5000): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: ServerMessage[] = [];
    const timeout = setTimeout(() => {
      reject(new Error(`timed out waiting for ${count} messages, got ${messages.length}: ${JSON.stringify(messages)}`));
    }, timeoutMs);
    const handler = (event: MessageEvent) => {
      messages.push(parseMessage(event));
      if (messages.length === count) {
        clearTimeout(timeout);
        ws.removeEventListener("message", handler);
        resolve(messages);
      }
    };
    ws.addEventListener("message", handler);
  });
}

export function sendMessage(ws: WebSocket, message: Record<string, unknown>): void {
  ws.send(JSON.stringify(message));
}

export const V = 1;
