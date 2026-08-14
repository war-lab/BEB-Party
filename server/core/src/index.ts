import type { GameSummary } from "@beb/shared-core";
import { registry } from "./registry";
import { generateRoomCode } from "./ids";

export { RoomDO } from "./room-do";

const ROOM_CODE_MAX_ATTEMPTS = 5;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      return handleCreateRoom(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/catalog") {
      return handleCatalog();
    }

    const wsMatch = /^\/room\/([^/]+)\/ws$/.exec(url.pathname);
    if (wsMatch?.[1]) {
      return handleWebSocket(request, env, wsMatch[1]);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleCreateRoom(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.API_ROOMS_RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return new Response("rate limited", { status: 429 });
  }

  for (let attempt = 0; attempt < ROOM_CODE_MAX_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(code));
    const initResponse = await stub.fetch("https://room-do/init", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    if (initResponse.ok) {
      return Response.json({ code });
    }
    // 409(既にアクティブな部屋)の場合のみ再採番する
  }

  return new Response("failed to allocate room code", { status: 500 });
}

function handleCatalog(): Response {
  const games: GameSummary[] = Object.values(registry).map((gameModule) => ({
    id: gameModule.id,
    title: gameModule.title,
    playerCount: gameModule.playerCount,
    contents: gameModule.listContents(),
  }));
  return Response.json({ games });
}

async function handleWebSocket(request: Request, env: Env, code: string): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.WS_RATE_LIMITER.limit({ key: ip });
  if (!success) {
    return new Response("rate limited", { status: 429 });
  }

  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(code));
  return stub.fetch(request);
}
