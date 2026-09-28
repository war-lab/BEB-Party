// ロビーでホストが切断中の参加者を外す（ADR-0028）。
//
// 外した人の席が消えること、その端末の自動再接続が止まってホームへ戻ること、
// 本人が入り直せば新しい席で戻れることを通しで確かめる。
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { openTable } from "./support/room";

/** WebSocketを中継し、blocked のあいだは新しい接続をサーバへつながずに閉じる */
function relay(page: Page) {
  const control = { blocked: false, current: undefined as WebSocketRoute | undefined };
  const install = page.routeWebSocket(/\/room\/.*\/ws/, (ws) => {
    if (control.blocked) {
      void ws.close();
      return;
    }
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => ws.send(message));
    control.current = ws;
  });
  return { control, install };
}

test("切断中の参加者をホストが外すと席が消え、その人はホームから入り直せる", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  let guestRelay: ReturnType<typeof relay> | undefined;
  const table = await openTable(browser, baseURL!, [3, 3, 3], {
    testTitle: test.info().title,
    prepare: async (page, index) => {
      if (index === 2) {
        guestRelay = relay(page);
        await guestRelay.install;
      }
    },
  });

  try {
    const [host, other, guest] = table.pages as [Page, Page, Page];
    for (const page of [host, other, guest]) {
      await page.setViewportSize({ width: 390, height: 844 });
    }
    const tiles = host.locator("[data-testid='participant-tile']");
    await expect(tiles).toHaveCount(3);
    // 接続中の人には外す操作を出さない
    await expect(host.locator("[data-testid='kick']")).toHaveCount(0);

    // 3人目の接続を切り、戻れないようにする
    guestRelay!.control.blocked = true;
    await guestRelay!.control.current!.close();
    const guestTile = tiles.filter({ hasText: "Player3" });
    await expect(guestTile.locator(".disconnected-badge")).toBeVisible({ timeout: 15_000 });

    // ホストにだけ出る。ホスト以外の画面には出ない
    await expect(guestTile.locator("[data-testid='kick']")).toHaveText("外す");
    await expect(other.locator("[data-testid='kick']")).toHaveCount(0);
    await host.screenshot({ path: test.info().outputPath("host-lobby-kick.png") });

    // 1回目は確認に切り替わるだけで、席は残る
    await guestTile.locator("[data-testid='kick']").click();
    await expect(guestTile.locator("[data-testid='kick']")).toHaveText("外す？");
    await expect(tiles).toHaveCount(3);
    await guestTile.locator("[data-testid='kick']").click();
    await expect(tiles).toHaveCount(2, { timeout: 10_000 });
    await expect(other.locator("[data-testid='participant-tile']")).toHaveCount(2, { timeout: 10_000 });

    // 外された端末の再接続を許す。kicked で止まり、部屋コードの入ったホームへ戻る
    guestRelay!.control.blocked = false;
    await expect(guest.locator(".banner.error")).toHaveText("ホストに部屋から外されました", {
      timeout: 30_000,
    });
    await expect(guest.locator('input[placeholder="部屋コード"]')).toHaveValue(table.code);
    await expect(guest.locator('input[placeholder="なまえ"]')).toHaveValue("Player3");
    await guest.screenshot({ path: test.info().outputPath("guest-kicked.png") });
    // 自動で席を取り直していない
    await expect(tiles).toHaveCount(2);

    // 本人が入り直すと、新しい席で戻れる
    await guest.click("text=参加する");
    await guest.waitForSelector(".room-chip .code");
    await expect(guest.locator(".banner.error")).toHaveCount(0);
    await expect(tiles).toHaveCount(3, { timeout: 10_000 });
    await expect(tiles.filter({ hasText: "Player3" }).locator(".disconnected-badge")).toHaveCount(0);
  } finally {
    await table.close();
  }
});
