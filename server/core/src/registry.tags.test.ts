// 収録ゲームのタグの規則（基本設計/05の「遊び方の形のタグ」）。
// 形のタグを付け忘れたゲーム、形を2つ持つゲームが一覧に出ることを検出する
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { isFormatTag, sortGameTags, type GameSummary } from "@beb/shared-core";
import { registry } from "./registry";

describe("遊び方の形のタグ", () => {
  it("収録ゲームはすべて、形のタグをちょうど1つ持ち、同じタグを重ねない", () => {
    const entries = Object.entries(registry);
    expect(entries.length).toBeGreaterThan(0);
    for (const [gameId, gameModule] of entries) {
      const formats = gameModule.tags.filter((tag) => isFormatTag(tag));
      expect(formats, gameId).toHaveLength(1);
      expect(new Set(gameModule.tags).size, gameId).toBe(gameModule.tags.length);
    }
  });

  it("カタログはタグを形→性質の順に並べて返す", async () => {
    const response = await exports.default.fetch(new Request("https://example.com/api/catalog"));
    const body = (await response.json()) as { games: GameSummary[] };
    expect(body.games.length).toBeGreaterThan(0);
    for (const game of body.games) {
      expect(game.tags, game.id).toEqual(sortGameTags(registry[game.id]?.tags ?? []));
      // 先頭は必ず形のタグ
      expect(isFormatTag(game.tags[0]!), game.id).toBe(true);
    }
  });
});
