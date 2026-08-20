<script lang="ts">
  import type { Component } from "svelte";
  import { App as ClientCoreApp } from "@beb/client-core";

  // gameId→画面ローダーのテーブル。ゲームを追加したらここに1行足す（基本設計/05）。
  // 'detectives'リテラルを書いてよいのはregistry.tsとclient/appだけ（基本設計/07の検査3）
  const gameScreens: Record<string, () => Promise<{ default: Component }>> = {
    detectives: () => import("@beb/client-detectives") as Promise<{ default: Component }>,
    dontsayit: () => import("@beb/client-dontsayit") as Promise<{ default: Component }>,
  };

  // gameId→遊び方ローダーのテーブル。ルール説明もゲームモジュールが持つ
  const gameGuides: Record<string, () => Promise<{ default: Component }>> = {
    detectives: () => import("@beb/client-detectives/guide") as Promise<{ default: Component }>,
    dontsayit: () => import("@beb/client-dontsayit/guide") as Promise<{ default: Component }>,
  };

  // gameId→ステージ表示文言のローダー。ホスト画面がステージ名を出すために使う（基本設計/02）
  const gameStageLabels: Record<string, () => Promise<{ default: Record<string, string> }>> = {
    detectives: () => import("@beb/client-detectives/stage-labels"),
    dontsayit: () => import("@beb/client-dontsayit/stage-labels"),
  };
</script>

<ClientCoreApp {gameScreens} {gameGuides} {gameStageLabels} />
