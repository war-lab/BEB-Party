import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 1テストが最大6つのブラウザコンテキストを開き、それらが1つのwrangler devへ同時接続する。
  // 既定の並列度(CPU数の半分)ではローカルもCIも飽和し、無関係なテストがタイムアウトする（実測）
  workers: 2,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // wrangler devが静的アセットとWorkerを同一オリジンで配信するため、本番相当の構成でE2Eを行う。
  // 起動には`pnpm dev`ではなく`pnpm e2e:server`を使う。wrangler devはProxyWorkerの
  // "Network connection lost."でプロセスごと終了することがあり（未修正の上流バグ）、
  // Playwrightはテスト中のwebServerの終了を検知しないため、以降の全テストがretryごと
  // ERR_CONNECTION_REFUSEDで落ちる。e2e:serverは終了を検知して再起動する（ADR-0021）
  webServer: {
    command: "pnpm e2e:server",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // サーバがテスト中に終了した場合、既定(stdoutは破棄)では原因がログに残らない。
    // wrangler devは`--log-level warn`（`dev:e2e`）で起動するため、リクエストログは出ない
    stdout: "pipe",
    stderr: "pipe",
  },
});
