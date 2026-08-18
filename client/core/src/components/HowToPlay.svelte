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

    <details open>
      <summary><h2>英語に詰まったら</h2></summary>
      <p class="lead">どのゲームでも使える。読み上げるのは英文のほうとする。</p>
      <ul class="phrases">
        <li><b>Say that again, please.</b><span>もう一度お願い</span></li>
        <li><b>Slowly, please.</b><span>ゆっくりお願い</span></li>
        <li><b>What does "＿＿" mean?</b><span>「＿＿」ってどういう意味？</span></li>
        <li><b>How do you say "＿＿" in English?</b><span>「＿＿」は英語で何て言う？</span></li>
        <li><b>Wait a moment.</b><span>ちょっと待って</span></li>
        <li><b>I do not know.</b><span>わからない</span></li>
        <li><b>Your turn.</b><span>あなたの番</span></li>
        <li><b>Me?</b><span>私？</span></li>
      </ul>
      <p class="note">
        言い方が出てこないときは、単語だけでもよい。まわりは英語で聞き返して助ける。
        日本語で説明してしまうと、そのゲームの目的（英語で話す）が消える。
      </p>
    </details>

    <details>
      <summary><h2>はじめに</h2></summary>
      <ul>
        <li>同じ部屋にいる5〜6人で遊ぶ。会話は声で行い、スマホは各自1台使う</li>
        <li>1人が「部屋を作る」を押し、残りは部屋コードかQRコードで参加する</li>
        <li>なまえと英語レベル（1〜5）は自己申告する。レベルは役の割り当てと英文の難度に使う</li>
        <li>画面はサーバが進める。自分で先へ進める操作は要らない</li>
        <li>各ステージの画面上部に「いまやること」が出る。進行役が仕切らなくても進む</li>
        <li>通信が切れても自動でつながり直す。表示は切れる直前のまま残る</li>
      </ul>
    </details>

    <details>
      <summary><h2>困ったとき</h2></summary>
      <ul>
        <li><b>画面が止まった・接続が切れた</b>: そのまま待つ。自動で戻る。戻らなければブラウザを再読み込みする。同じ端末なら席はそのまま</li>
        <li><b>途中で人が抜けた</b>: 抜けた人は「切断中」と表示される。ゲームは続く。ホストが抜けた場合は次の人へ自動で移る</li>
        <li><b>名前やレベルを間違えた</b>: ロビーのうちに部屋を出て入り直す</li>
        <li><b>部屋に入れない</b>: 部屋コードは4文字。紛らわしい文字（O・0・I・1）は使っていない。人数が上限に達している場合も入れない</li>
        <li><b>時間が足りない・余った</b>: 捜査の長さはロビーでホストが決める。捜査中はホストが早めに切り上げられる</li>
        <li><b>大きな画面に出したい</b>: ホスト画面（<code>/room/部屋コード?mode=host</code>）を別の端末で開く。ステージ名・残り時間・参加者だけが大きく出る</li>
      </ul>
    </details>

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
      <details open class="game-guide">
        <summary><h2>{selectedTitle}</h2></summary>
        <Guide />
      </details>
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
    padding: 1rem 1.25rem calc(1rem + var(--footer-clearance));
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
    font-weight: var(--font-heading-weight);
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
    font-weight: var(--font-heading-weight);
  }
  ul {
    padding-left: 1.2rem;
    line-height: 1.8;
  }
  details {
    border-bottom: 1px solid rgba(22, 27, 51, 0.15);
    padding-bottom: 0.5rem;
  }
  summary {
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  /* 見出しを開閉のトリガーにする。開いているかは記号で示す */
  summary h2::before {
    content: "＋ ";
    color: var(--blue);
  }
  details[open] summary h2::before {
    content: "− ";
  }
  summary h2 {
    display: inline-block;
  }
  .lead {
    margin: 0 0 0.4rem;
    line-height: 1.7;
  }
  .note {
    font-size: 0.85rem;
    line-height: 1.7;
  }
  code {
    background: rgba(22, 27, 51, 0.08);
    border-radius: 4px;
    padding: 0 0.25rem;
    font-size: 0.85em;
    overflow-wrap: anywhere;
  }
  .phrases {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .phrases li {
    display: flex;
    flex-direction: column;
    border-left: 3px solid var(--blue);
    padding: 0.15rem 0 0.15rem 0.6rem;
    line-height: 1.5;
  }
  .phrases b {
    font-size: 0.95rem;
  }
  .phrases span {
    font-size: 0.78rem;
    color: var(--ink-soft);
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
    font-weight: var(--font-heading-weight);
  }
  .game-tabs button.selected {
    background: var(--ink);
    color: var(--panel);
  }
</style>
