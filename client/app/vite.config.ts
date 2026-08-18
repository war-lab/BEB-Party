import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  // フォントサブセットの生成物はclient/public/(client/app単体ではなくclient/配下で共有)に置く
  publicDir: "../public",
  plugins: [
    svelte({
      // 自プロジェクトのファイルにのみrunesモードを強制する（ADR-0010）。
      // svelte.config.jsのruns:trueはnode_modules配下のコンポーネントにも及ぶため使わない
      dynamicCompileOptions({ filename }) {
        if (!filename.includes("node_modules")) {
          return { runes: true };
        }
      },
    }),
  ],
});
