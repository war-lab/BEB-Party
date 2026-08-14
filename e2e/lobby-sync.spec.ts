// 受入条件1: 6つのブラウザコンテキストを同時接続し、全員のロビーに6人が表示される
// (M0完了条件そのもの。docs/実装計画/M0.md)
import { test, expect } from "@playwright/test";

test("6 browser contexts sync to the same lobby state", async ({ browser, baseURL }) => {
  const contexts = await Promise.all(Array.from({ length: 6 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  try {
    await pages[0]!.goto(baseURL!);
    await pages[0]!.fill('input[placeholder="なまえ"]', "Player1");
    await pages[0]!.click("button.primary");
    await pages[0]!.waitForSelector("h1:has-text('部屋 ')");
    const code = (await pages[0]!.locator("h1").textContent())?.replace("部屋 ", "").trim();
    expect(code).toMatch(/^[A-Z2-9]{4}$/);

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
  } finally {
    await Promise.all(contexts.map((ctx) => ctx.close()));
  }
});
