// 遊び方ムービーの素材を撮るためのPlaywright設定。
//
// 通常のE2E（playwright.config.ts）とは別にする。目的が検証ではなく素材の生成であり、
// 失敗時のリトライやレポートの扱いも違う。撮影対象は本番ではなくローカルのe2e用サーバとし、
// 撮り直しても同じ画面が出るようにする（本番の部屋の状態に依存させない）。
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./capture",
  // 1本ずつ順に撮る。複数の卓を同時に立てると1つのwrangler devが飽和する（playwright.config.tsの実測）
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  // 1テストで1ゲームを通しでプレイするため長めに取るが、
  // セレクタ違いで10分ハングした（実測）ため、待ちが妥当な範囲へ詰める
  timeout: 240_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://127.0.0.1:8787",
    // devices の展開は viewport より前に置く。後に置くと Desktop Chrome の
    // 1280x720 が viewport を上書きし、スマホ縦の代わりに横長の画面が撮れる（実測）
    ...devices["Desktop Chrome"],
    // スマホ縦。動画が1080x1920なので、その半分で撮って倍のスケールで等倍にする
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2,
    isMobile: false,
    // 各コンテキストの操作を録画する。字幕だけでは伝わらない動き（入力・カットイン）に使う
    video: { mode: "on", size: { width: 540, height: 960 } },
  },
  webServer: {
    command: "pnpm e2e:server",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: "..",
  },
});
