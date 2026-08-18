import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  // svelte-checkはvite.config.tsのdynamicCompileOptionsを読まず、rune未使用ファイルは
  // 自動判定でlegacyモードのまま通してしまう（実測済み）。svelte-checkはnode_modulesを
  // 検査対象にしないため、ここでruntimeモードを固定してもADR-0010の懸念（外部依存への波及）は生じない
  compilerOptions: { runes: true },
};
