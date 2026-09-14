// 開始できない理由がロビーに出ること。
//
// 開始ボタンの無効化条件はコンテンツ選択だけで、人数が範囲外でも押せてサーバが黙って拒否し、
// 未接続では送信そのものが捨てられていた。3経路のうち、E2Eで作れる2つをここで固定する。
import { expect, test, type WebSocketRoute } from "@playwright/test";
import { clientIpHeaders, createRoom, joinRoom, openTable, readRoomCode } from "./support/room";

test("人数が足りないあいだは開始できず、あと何人かが出る", async ({ browser, baseURL }) => {
  // 収録ゲームはいずれも5〜6人。3人で止めて理由を読む
  const table = await openTable(browser, baseURL!, [3, 3, 3], { testTitle: test.info().title });

  try {
    const host = table.pages[0]!;
    await host.click(".title-card:has-text('ENGLISH DETECTIVES')");

    const start = host.locator("[data-testid='start']");
    await expect(start).toBeDisabled();
    await expect(host.locator("[data-testid='start-note']")).toHaveText(
      "あと2人必要です（いま3人、5〜6人で遊べます）",
    );

    // 5人目が入ると理由が消え、押せるようになる
    const code = await readRoomCode(host);
    const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(test.info().title) });
    const fourth = await context.newPage();
    const fifth = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders(test.info().title) })).newPage();
    await joinRoom(fourth, baseURL!, "Player4", 3, code);
    await joinRoom(fifth, baseURL!, "Player5", 3, code);

    await expect(host.locator("[data-testid='start-note']")).toHaveCount(0, { timeout: 10_000 });
    await expect(start).toBeEnabled();

    await context.close();
    await fifth.context().close();
  } finally {
    await table.close();
  }
});

test("接続が切れているあいだは開始できず、待つよう出る", async ({ page, baseURL }) => {
  await page.setExtraHTTPHeaders(clientIpHeaders("lobby-start-block-offline"));

  let route: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/room\/.*\/ws/, async (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(message));
    route = ws;
  });

  await createRoom(page, baseURL!, "Host", 3);
  await page.click(".title-card:has-text('ENGLISH DETECTIVES')");
  // 1人しかいないため、まずは人数の理由が出ている
  await expect(page.locator("[data-testid='start-note']")).toContainText("あと4人必要です");

  route?.close();

  // 切断中は人数より先に接続の理由を出す。直せる順が違う
  await expect(page.locator("[data-testid='start-note']")).toHaveText("接続が戻るまで待ってください", {
    timeout: 10_000,
  });
  await expect(page.locator("[data-testid='start']")).toBeDisabled();
});
