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

    return serveAssetsWithSpaFallback(request, env);
  },
} satisfies ExportedHandler<Env>;

// env.ASSETS.fetch()をWorkerコードから明示的に呼ぶ場合、wrangler.jsoncのnot_found_handling
// (自動アセットルーティング専用)は適用されない。/room/:code等の拡張子を持たないSPA内部ルートは
// 実ファイルが無く、ASSETS側の既定動作(html_handling)で404より前にリダイレクトが返ることがあるため、
// 404判定ではなく拡張子の有無で判定し、index.htmlへ直接フォールバックする
function looksLikeStaticAssetPath(pathname: string): boolean {
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

async function serveAssetsWithSpaFallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  // "/"自体とファイル名を持つ実アセットはそのまま渡す。"/index.html"への書き換えは
  // それ自体が"/"へ正規化リダイレクトされるため、"/"を対象に含めると無限リダイレクトになる
  if (url.pathname === "/" || looksLikeStaticAssetPath(url.pathname)) {
    return env.ASSETS.fetch(request);
  }
  // "/index.html"を直接指定すると"/"への正規化307が返るため、canonicalな"/"として取得する。
  // 元のURL(/room/:code等)はブラウザに見せる必要が無く、ここではcontentだけを流用する
  const rootUrl = new URL(request.url);
  rootUrl.pathname = "/";
  return env.ASSETS.fetch(new Request(rootUrl, request));
}

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
  // gameIdはregistryのキーを正とする（モジュール側に持たせると二重管理になる）
  const games: GameSummary[] = Object.entries(registry).map(([gameId, gameModule]) => ({
    id: gameId,
    title: gameModule.title,
    tagline: gameModule.tagline,
    icon: gameModule.icon,
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
