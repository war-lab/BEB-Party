import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// .svelte.tsモジュールの$stateはSvelteコンパイラの変換が必要なため、vitestにもプラグインを通す
export default defineConfig({
  plugins: [
    svelte({
      dynamicCompileOptions({ filename }) {
        if (!filename.includes("node_modules")) {
          return { runes: true };
        }
      },
    }),
  ],
  test: {
    environment: "jsdom",
  },
});
