// moviesの単体テスト設定。
//
// vite.config.ts をそのまま使わせない理由は2つある。
// * `capture/*.spec.ts` はPlaywrightのテストであり、vitestが拾うと収集時に落ちる
// * Motion Canvasのプラグイン（`?scene` 変換・ffmpegエクスポータ）は単体テストに要らない
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 撮影スクリプトはPlaywrightが実行する（pnpm --filter @beb/movies run capture）
    exclude: ["capture/**", "node_modules/**", "dist/**", "output/**", "assets/**"],
  },
});
