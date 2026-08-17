<script lang="ts">
  import type { GameSummary } from "@beb/shared-core";
  import { serverState } from "../stores/server-state.svelte";
  import { ui } from "../stores/ui.svelte";
  import { sendCommon } from "../connection";
  import ParticipantTile from "./ParticipantTile.svelte";

  interface Props {
    code: string;
  }
  let { code }: Props = $props();

  let catalog = $state<GameSummary[]>([]);
  let qrSvg = $state<string | null>(null);
  let investigationSeconds = $state(600);
  let contentId = $state<string | null>(null);

  $effect(() => {
    fetch("/api/catalog")
      .then((response) => response.json())
      .then((body: { games: GameSummary[] }) => {
        catalog = body.games;
      })
      .catch(() => {
        catalog = [];
      });
  });

  $effect(() => {
    // ロビー画面からのみ動的importする。初回ロードのバンドルにuqrを含めない（基本設計/02_クライアント.md）
    import("uqr").then(({ renderSVG }) => {
      qrSvg = renderSVG(`${location.origin}/room/${code}`);
    });
  });

  const room = $derived(serverState.room);
  const isHost = $derived(room?.players.find((p) => p.id === ui.myPlayerId)?.isHost ?? false);
  const selectedGame = $derived(catalog.find((game) => game.id === room?.gameId));
  const contents = $derived(selectedGame?.contents ?? []);

  function selectGame(gameId: string): void {
    contentId = null;
    sendCommon({ type: "selectGame", gameId });
  }

  // コンテンツと設定は同じconfigureで送る。コンテンツ未選択のstartはサーバが拒否する（基本設計/01）
  function configure(id: string): void {
    contentId = id;
    sendCommon({ type: "configure", contentId: id, settings: { investigationSeconds } });
  }

  function start(): void {
    sendCommon({ type: "start" });
  }
</script>

<main class="lobby">
  <h1>部屋 {code}</h1>

  <div class="qr-panel">
    {#if qrSvg}
      <!-- uqrのrenderSVGが自室コードURLから生成したSVGであり、外部・ユーザー入力は含まれない -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html qrSvg}
    {/if}
    <p>このコードで参加: <strong>{code}</strong></p>
  </div>

  <section class="participants">
    {#each room?.players ?? [] as player (player.id)}
      <ParticipantTile {player} />
    {/each}
  </section>

  {#if isHost}
    <section class="host-controls">
      <h2>ゲームを選ぶ</h2>
      <ul class="catalog">
        {#each catalog as game (game.id)}
          <li>
            <button onclick={() => selectGame(game.id)} class:selected={room?.gameId === game.id}>
              {game.title}
            </button>
          </li>
        {/each}
      </ul>

      {#if room?.gameId}
        <h2>コンテンツを選ぶ</h2>
        <ul class="catalog">
          {#each contents as content (content.id)}
            <li>
              <button onclick={() => configure(content.id)} class:selected={room?.contentId === content.id}>
                {content.title}
              </button>
            </li>
          {/each}
        </ul>

        <label>
          捜査時間(秒)
          <input
            type="number"
            bind:value={investigationSeconds}
            min="300"
            max="1200"
            step="60"
            onchange={() => (contentId ? configure(contentId) : undefined)}
          />
        </label>
        <button class="primary" onclick={start} disabled={!room?.contentId}>はじめる</button>
      {/if}
    </section>
  {/if}
</main>

<style>
  .lobby {
    min-height: 100vh;
    background: var(--sky);
    color: var(--ink);
    font-family: var(--font-body);
    padding: 1rem 1rem calc(1rem + var(--footer-clearance));
  }
  h1 {
    font-family: var(--font-display);
  }
  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
  }
  .qr-panel {
    background: var(--panel);
    border-radius: var(--radius-card);
    padding: 1rem;
    display: inline-block;
  }
  .participants {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .catalog {
    list-style: none;
    padding: 0;
    display: flex;
    gap: 0.5rem;
  }
  .catalog button.selected {
    outline: var(--outline-width) solid var(--yellow);
  }
  .primary {
    background: var(--red);
    color: white;
    border: none;
    border-radius: var(--radius-button);
    padding: 0.75rem 2rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    box-shadow: var(--shadow-hard);
  }
  .primary:disabled {
    background: #9aa0b5;
    box-shadow: none;
  }
</style>
