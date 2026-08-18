// Workerのルーティング（POST /api/rooms、GET /api/catalog）の基本動作
import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { registry } from "./registry";
import { STUB_GAME_ID, stubGameModule } from "./test-support/stub-game-module";

beforeAll(() => {
  registry[STUB_GAME_ID] = stubGameModule;
});

describe("Workerルーティング", () => {
  it("POST /api/roomsで部屋コードが発行される", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/api/rooms", { method: "POST" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { code: string };
    expect(body.code).toMatch(/^[A-Z2-9]{4}$/);
  });

  it("GET /api/catalogでregistryに登録済みのゲームが返る", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/api/catalog"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { games: { id: string }[] };
    expect(body.games.some((game) => game.id === STUB_GAME_ID)).toBe(true);
  });
});
