// 受入条件2: ホストが切断すると、残り5人の画面で次の参加者にホスト表示が移る
import { test, expect } from "@playwright/test";
import { clientIpHeaders, createRoom, joinRoom, readRoomCode } from "./support/room";

test("host disconnect transfers host badge to the next participant on all remaining screens", async ({
  browser,
  baseURL,
}) => {
  const extraHTTPHeaders = clientIpHeaders(test.info().title);
  const contexts = await Promise.all(Array.from({ length: 6 }, () => browser.newContext({ extraHTTPHeaders })));
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  try {
    await createRoom(pages[0]!, baseURL!, "Player1", 5);
    const code = await readRoomCode(pages[0]!);

    for (let i = 1; i < 6; i++) {
      await joinRoom(pages[i]!, baseURL!, `Player${i + 1}`, 3, code);
    }
    for (const page of pages) {
      await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(6, { timeout: 10_000 });
    }

    // ホスト(pages[0])を切断する
    await contexts[0]!.close();

    // 残り5人全員の画面で、次点参加者(Player2)にホストバッジが移る
    for (let i = 1; i < 6; i++) {
      const hostTile = pages[i]!.locator(".beb-tile", { hasText: "Player2" });
      await expect(hostTile.locator(".host-badge")).toBeVisible({ timeout: 10_000 });
    }
  } finally {
    await Promise.all(contexts.slice(1).map((ctx) => ctx.close()));
  }
});
