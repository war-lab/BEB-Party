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
  // wrangler devが静的アセスとWorkerを同一オリジンで配信するため、本番相当の構成でE2Eを行う
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
