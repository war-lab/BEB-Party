// ロビー状態での再接続。WebSocketを切断してもスナップショットが維持されたまま自動復帰する。
//
// M0時点ではregistry.tsが空テーブルでlifecycle: playingへ到達できなかったため、この
// ロビー版だけを置いていた。捜査ステージ中の再接続はM2で
// detectives-playthrough.spec.tsが検証する。両方を残すのは、ゲーム選択前の経路も
// 実際に使われるためである。
import { test, expect, type WebSocketRoute } from "@playwright/test";
import { clientIpHeaders, createRoom, readRoomCode } from "./support/room";

// 部屋作成はIPごとに5回/60秒。テストごとにIPを分ける（support/room.tsのclientIpHeaders）
test.use({ extraHTTPHeaders: clientIpHeaders("reconnect-lobby") });

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

  await createRoom(page, baseURL!, "Host", 3);
  await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(1);

  const codeBefore = await readRoomCode(page);

  // WebSocketを強制切断する(ページはリロードしない。JS上のserverStateはそのまま)
  route?.close();

  // 再接続バナーが出る間も、直前のスナップショット(参加者タイル)が消えずに維持される
  await expect(page.locator("text=再接続しています")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(1);
  expect(await readRoomCode(page)).toBe(codeBefore);

  // 自動再接続で復帰し、バナーが消える
  await expect(page.locator("text=再接続しています")).not.toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(1);
});
