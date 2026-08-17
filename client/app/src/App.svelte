<script lang="ts">
  import type { Component } from "svelte";
  import { App as ClientCoreApp } from "@beb/client-core";

  // gameId→画面ローダーのテーブル。ゲームを追加したらここに1行足す（基本設計/05）。
  // 'detectives'リテラルを書いてよいのはregistry.tsとclient/appだけ（基本設計/07の検査3）
  const gameScreens: Record<string, () => Promise<{ default: Component }>> = {
    detectives: () => import("@beb/client-detectives") as Promise<{ default: Component }>,
  };
</script>

<ClientCoreApp {gameScreens} />
