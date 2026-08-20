// 受入条件1: 6つのブラウザコンテキストを同時接続し、全員のロビーに6人が表示される
// (M0完了条件そのもの。docs/実装計画/M0.md)
import { test, expect } from "@playwright/test";
import { TEST_ICONS, openTable } from "./support/room";

test("6 browser contexts sync to the same lobby state", async ({ browser, baseURL }) => {
  // 部屋作成はIPごとに5回/60秒。テストごとにIPを分ける（support/room.tsのclientIpHeaders）
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], { testTitle: test.info().title });

  try {
    expect(table.code).toMatch(/^[A-Z2-9]{4}$/);

    // ゲーム選択カードは、アイコン・タイトル・一行説明・人数を出す（ホストにのみ表示）。
    // 収録ゲームが増えるとカードも増えるため、ゲームごとに絞って確認する
    const host = table.pages[0]!;
    const detectives = host.locator(".title-card", { hasText: "ENGLISH DETECTIVES" });
    await expect(detectives).toContainText("英語で聞き込み");
    await expect(detectives).toContainText("5〜6人");
    await expect(detectives.locator(".title-card-icon")).toHaveText("🔍");

    const dontSayIt = host.locator(".title-card", { hasText: "DON'T SAY IT" });
    await expect(dontSayIt).toContainText("禁止語を避けて");
    await expect(dontSayIt).toContainText("5〜6人");
    await expect(dontSayIt.locator(".title-card-icon")).toHaveText("🤐");
    for (const page of table.pages) {
      await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(6, { timeout: 10_000 });
    }

    // 各自が選んだアイコンは、サーバのstateを経由して全員の画面に同じ並びで出る
    for (const page of table.pages) {
      for (const [index, icon] of TEST_ICONS.entries()) {
        const tile = page.locator(".roster .beb-tile", { hasText: `Player${index + 1}` });
        await expect(tile.locator('[data-testid="participant-icon"] img')).toHaveAttribute(
          "src",
          `/player-icons/${icon.id}.png`,
        );
      }
    }
  } finally {
    await table.close();
  }
});
