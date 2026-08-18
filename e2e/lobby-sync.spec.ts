// 受入条件1: 6つのブラウザコンテキストを同時接続し、全員のロビーに6人が表示される
// (M0完了条件そのもの。docs/実装計画/M0.md)
import { test, expect } from "@playwright/test";
import { openTable } from "./support/room";

test("6 browser contexts sync to the same lobby state", async ({ browser, baseURL }) => {
  // 部屋作成はIPごとに5回/60秒。テストごとにIPを分ける（support/room.tsのclientIpHeaders）
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], { testTitle: test.info().title });

  try {
    expect(table.code).toMatch(/^[A-Z2-9]{4}$/);
    for (const page of table.pages) {
      await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(6, { timeout: 10_000 });
    }
  } finally {
    await table.close();
  }
});
