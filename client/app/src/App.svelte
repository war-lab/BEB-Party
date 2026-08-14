<script lang="ts">
  import type { Component } from "svelte";
  import { App as ClientCoreApp } from "@beb/client-core";

  // M0時点では収録ゲームが無いため空のテーブル。ゲームを追加したらここに1行足す（基本設計/05）
  const gameScreens: Record<string, () => Promise<{ default: Component }>> = {};
</script>

<ClientCoreApp {gameScreens} />
