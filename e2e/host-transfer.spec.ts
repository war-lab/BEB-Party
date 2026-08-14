// 受入条件2: ホストが切断すると、残り5人の画面で次の参加者にホスト表示が移る
import { test, expect } from "@playwright/test";

test("host disconnect transfers host badge to the next participant on all remaining screens", async ({
  browser,
  baseURL,
}) => {
  const contexts = await Promise.all(Array.from({ length: 6 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  try {
    await pages[0]!.goto(baseURL!);
    await pages[0]!.fill('input[placeholder="なまえ"]', "Host");
    await pages[0]!.click("button.primary");
    await pages[0]!.waitForSelector("h1:has-text('部屋 ')");
    const code = (await pages[0]!.locator("h1").textContent())?.replace("部屋 ", "").trim();

    for (let i = 1; i < 6; i++) {
      await pages[i]!.goto(baseURL!);
      await pages[i]!.fill('input[placeholder="なまえ"]', `Player${i + 1}`);
      await pages[i]!.fill('input[placeholder="部屋コード"]', code!);
      await pages[i]!.click("text=参加する");
      await pages[i]!.waitForSelector("h1:has-text('部屋 ')");
    }
    for (const page of pages) {
      await expect(page.locator(".participants .tile")).toHaveCount(6, { timeout: 10_000 });
    }

    // ホスト(pages[0])を切断する
    await contexts[0]!.close();

    // 残り5人全員の画面で、次点参加者(Player2)にホストバッジが移る
    for (let i = 1; i < 6; i++) {
      const hostTile = pages[i]!.locator(".tile", { hasText: "Player2" });
      await expect(hostTile.locator(".host-badge")).toBeVisible({ timeout: 10_000 });
    }
  } finally {
    await Promise.all(contexts.slice(1).map((ctx) => ctx.close()));
  }
});
