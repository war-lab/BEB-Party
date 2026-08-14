// 受入条件3(適応): WebSocketを切断してもスナップショットが維持されたまま自動復帰する。
//
// 元の受入条件は「捜査相当のステージ(スタブ)中」を想定しているが、M0のregistry.tsは
// 空テーブルという不変条件があり(基本設計/07、PR2a)、クライアント側からlifecycle: playing
// へ到達する手段がM0には無い。ロビー状態(lifecycle: lobby)で同じ再接続経路を検証することで
// 代替する（本セッションでの合意事項）。
import { test, expect, type WebSocketRoute } from "@playwright/test";

test("disconnecting the WebSocket keeps the last snapshot and recovers automatically", async ({
  page,
  baseURL,
}) => {
  let route: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/room\/.*\/ws/, async (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(message));
    route = ws;
  });

  await page.goto(baseURL!);
  await page.fill('input[placeholder="なまえ"]', "Host");
  await page.click("button.primary");
  await page.waitForSelector("h1:has-text('部屋 ')");
  await expect(page.locator(".participants .tile")).toHaveCount(1);

  const codeBefore = (await page.locator("h1").textContent())?.replace("部屋 ", "").trim();

  // WebSocketを強制切断する(ページはリロードしない。JS上のserverStateはそのまま)
  route?.close();

  // 再接続バナーが出る間も、直前のスナップショット(参加者タイル)が消えずに維持される
  await expect(page.locator("text=再接続しています")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".participants .tile")).toHaveCount(1);
  const codeDuringReconnect = (await page.locator("h1").textContent())?.replace("部屋 ", "").trim();
  expect(codeDuringReconnect).toBe(codeBefore);

  // 自動再接続で復帰し、バナーが消える
  await expect(page.locator("text=再接続しています")).not.toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".participants .tile")).toHaveCount(1);
});
