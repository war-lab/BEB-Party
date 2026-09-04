// レビュー指摘の回帰検証（PR #12）。
//
// 正解の申告（claimCorrect）は、送信できたときだけ確認シートを閉じる必要がある。
// sendActionは未接続のとき送らずに戻るため、閉じてしまうと届いていない加点が
// 受け付けられたように見え、その1枚分の得点が落ちる（基本設計/02の「英文の入力」と同じ規則）。
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { openTable } from "./support/room";

const GAME_TITLE = "DON'T SAY IT";
const SET_TITLE = "Famous Figures";

/** ホストがDON'T SAY ITとお題セットを選び、開始する */
async function startDontSayIt(host: Page): Promise<void> {
  await host.click(`.title-card:has-text("${GAME_TITLE}")`);
  await host.click(`.content-chip:has-text("${SET_TITLE}")`);
  await host.click(".beb-btn:has-text('ゲームスタート')");
}

/** その端末で見えている要素から役を判定する */
async function findPageBy(pages: Page[], selector: string, timeoutMs = 15_000): Promise<Page> {
  const started = Date.now();
  for (;;) {
    for (const page of pages) {
      if (await page.locator(selector).first().isVisible()) {
        return page;
      }
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`該当する端末がない: ${selector}`);
    }
    await pages[0]!.waitForTimeout(200);
  }
}

test("再接続中の正解の申告で確認シートが閉じない", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const routes = new Map<number, WebSocketRoute>();
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: test.info().title,
    prepare: async (page, index) => {
      // 誰が説明者になるかは開始時にサーバが決めるため、全端末を経由させる
      await page.routeWebSocket(/\/room\/.*\/ws/, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => server.send(message));
        server.onMessage((message) => ws.send(message));
        routes.set(index, ws);
      });
    },
  });

  try {
    await startDontSayIt(table.pages[0]!);

    // ルール確認 → 交代 → 説明タイム。説明者の端末だけが伏せ面を持つ
    for (const page of table.pages) {
      await expect(page.locator(".roles")).toBeVisible({ timeout: 20_000 });
      await page.click(".beb-btn:has-text('準備できた')");
    }
    const speaker = await findPageBy(table.pages, "[data-testid='speaker-cover']");
    await speaker.click("[data-testid='speaker-cover']");
    await expect(speaker.locator("[data-testid='speaker-card']")).toBeVisible({ timeout: 10_000 });
    await speaker.click(".beb-btn:has-text('はじめる')");

    // 説明者が正解を申告しようとして確認シートを開く
    await expect(speaker.locator("[data-testid='answer']")).toBeVisible({ timeout: 15_000 });
    await speaker.click(".beb-btn:has-text('正解')");
    await expect(speaker.locator("[data-testid='claim-sheet']")).toBeVisible({ timeout: 10_000 });

    // 説明者の端末だけ切断する
    const speakerIndex = table.pages.indexOf(speaker);
    routes.get(speakerIndex)?.close();
    await expect(speaker.locator("text=再接続しています")).toBeVisible({ timeout: 10_000 });

    // 切断中に回答者を選ぶ。送信できないため、シートを閉じてはならない
    await speaker.locator("[data-testid='claim-sheet'] .beb-btn.blue").first().click();
    await expect(speaker.locator("[data-testid='claim-sheet']")).toBeVisible();

    // 復帰後に申告し直せる（成立枚数が増える）
    await expect(speaker.locator("text=再接続しています")).not.toBeVisible({ timeout: 30_000 });
    await expect(speaker.locator("[data-testid='claim-sheet']")).toBeVisible();
    await speaker.locator("[data-testid='claim-sheet'] .beb-btn.blue").first().click();
    await expect(speaker.locator("[data-testid='claim-sheet']")).toHaveCount(0, { timeout: 10_000 });
    await expect(speaker.locator("[data-testid='solved-count']")).toContainText("成立 1枚", { timeout: 10_000 });
  } finally {
    await table.close();
  }
});
