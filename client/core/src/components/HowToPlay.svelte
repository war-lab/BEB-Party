<!--
  遊び方。共通の進め方（部屋・レベル・切断時）と、ゲームごとのルールを1画面にまとめる。

  ゲームごとのルールは client/app が組み立てたテーブルから動的importする。
  共通コアはどのゲームが登録されているかを知らない（不変条件4、ADR-0009）。
-->
<script lang="ts">
  import type { Component } from "svelte";
  import type { GameSummary } from "@beb/shared-core";
  import { serverState } from "../stores/server-state.svelte";

  interface Props {
    gameGuides: Record<string, () => Promise<{ default: Component }>>;
    onClose: () => void;
  }
  let { gameGuides, onClose }: Props = $props();

  let catalog = $state<GameSummary[]>([]);
  let selectedGameId = $state<string | null>(null);
  let guide = $state<Component | null>(null);

  $effect(() => {
    fetch("/api/catalog")
      .then((response) => response.json())
      .then((body: { games: GameSummary[] }) => {
        catalog = body.games;
        // 部屋でゲームを選んでいればそれを、無ければ先頭を開く
        selectedGameId ??= serverState.room?.gameId ?? body.games[0]?.id ?? null;
      })
      .catch(() => {
        catalog = [];
      });
  });

  $effect(() => {
    const loader = selectedGameId === null ? undefined : gameGuides[selectedGameId];
    if (!loader) {
      guide = null;
      return;
    }
    loader().then((module) => {
      guide = module.default;
    });
  });

  const selectedTitle = $derived(catalog.find((game) => game.id === selectedGameId)?.title ?? "");
</script>

<div class="overlay" data-testid="how-to-play">
  <div class="sheet">
    <header>
      <h1>遊び方</h1>
      <button class="close" onclick={onClose}>閉じる</button>
    </header>

    <section>
      <h2>はじめに</h2>
      <ul>
        <li>同じ部屋にいる5〜6人で遊ぶ。会話は声で行い、スマホは各自1台使う</li>
        <li>1人が「部屋を作る」を押し、残りは部屋コードかQRコードで参加する</li>
        <li>なまえと英語レベル（1〜5）は自己申告する。レベルは役の割り当てと英文の難度に使う</li>
        <li>画面はサーバが進める。自分で先へ進める操作は要らない</li>
        <li>通信が切れても自動でつながり直す。表示は切れる直前のまま残る</li>
      </ul>
    </section>

    {#if catalog.length > 1}
      <nav class="game-tabs">
        {#each catalog as game (game.id)}
          <button class:selected={game.id === selectedGameId} onclick={() => (selectedGameId = game.id)}>
            {game.title}
          </button>
        {/each}
      </nav>
    {/if}

    {#if guide}
      {@const Guide = guide}
      <section class="game-guide">
        <h2>{selectedTitle}</h2>
        <Guide />
      </section>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 950;
    background: rgba(13, 20, 46, 0.9);
    overflow-y: auto;
    padding: 1rem;
    font-family: var(--font-body);
  }
  .sheet {
    max-width: 40rem;
    margin: 0 auto;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    padding: 1rem 1.25rem 2rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    background: var(--panel);
    padding-top: 0.5rem;
  }
  h1,
  h2 {
    font-family: var(--font-heading);
  }
  h1 {
    font-size: 1.5rem;
    margin: 0;
  }
  h2 {
    font-size: 1.1rem;
    margin: 1.5rem 0 0.5rem;
  }
  .close {
    background: var(--ink);
    color: var(--panel);
    border: none;
    border-radius: var(--radius-button);
    padding: 0.4rem 1rem;
    font-family: var(--font-heading);
  }
  ul {
    padding-left: 1.2rem;
    line-height: 1.8;
  }
  .game-tabs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }
  .game-tabs button {
    background: none;
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-button);
    padding: 0.3rem 0.9rem;
    font-family: var(--font-heading);
  }
  .game-tabs button.selected {
    background: var(--ink);
    color: var(--panel);
  }
</style>
