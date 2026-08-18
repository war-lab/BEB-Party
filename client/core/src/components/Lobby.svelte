<!-- ロビー。キャラクターセレクト風のグリッドとタイトルカード（ビジュアルデザイン.mdのモック） -->
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

  const MAX_TILES = 6;

  let catalog = $state<GameSummary[]>([]);
  let qrSvg = $state<string | null>(null);
  let investigationSeconds = $state(600);
  let showQr = $state(false);

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
  const emptySlots = $derived(Math.max(0, MAX_TILES - (room?.players.length ?? 0)));

  function selectGame(gameId: string): void {
    sendCommon({ type: "selectGame", gameId });
  }

  // コンテンツと設定は同じconfigureで送る。コンテンツ未選択のstartはサーバが拒否する（基本設計/01）
  function configure(id: string): void {
    sendCommon({ type: "configure", contentId: id, settings: { investigationSeconds } });
  }

  // 設定だけを変えるときは、サーバが持っているコンテンツ選択をそのまま送り直す。
  // クライアント側の控えを条件にすると、リロードやホスト移譲のあとに送信されなくなる
  function reconfigure(): void {
    if (room?.contentId) {
      configure(room.contentId);
    }
  }

  // ゲームを選んだ直後は先頭のコンテンツ（おまかせ）を既定にする。
  // ホストが事件を選ばなくても始められるようにするため。別のものを選べば上書きされる
  $effect(() => {
    if (isHost && room?.gameId && room.contentId === undefined && contents.length > 0) {
      configure(contents[0]!.id);
    }
  });

  function start(): void {
    sendCommon({ type: "start" });
  }
</script>

<main class="lobby">
  <div class="room-chip">
    <span class="lbl">ROOM CODE</span>
    <span class="code">{code}</span>
    <button class="qr-toggle" onclick={() => (showQr = !showQr)}>{showQr ? "とじる" : "QR"}</button>
  </div>

  {#if showQr && qrSvg}
    <div class="qr-panel">
      <!-- uqrのrenderSVGが自室コードURLから生成したSVGであり、外部・ユーザー入力は含まれない -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html qrSvg}
      <p>このコードで参加: <strong>{code}</strong></p>
    </div>
  {/if}

  <section class="roster" aria-label="参加者">
    {#each room?.players ?? [] as player (player.id)}
      <ParticipantTile {player} />
    {/each}
    {#each Array.from({ length: emptySlots }, (_, index) => index) as slot (slot)}
      <div class="beb-tile empty">待機中…</div>
    {/each}
  </section>

  {#if isHost}
    <section class="host-controls">
      <h2>ゲームを選ぶ</h2>
      <ul class="title-cards">
        {#each catalog as game (game.id)}
          <li>
            <button class="title-card" class:selected={room?.gameId === game.id} onclick={() => selectGame(game.id)}>
              <span class="title-card-name">{game.title}</span>
              <span class="title-card-meta">{game.playerCount[0]}〜{game.playerCount[1]}人</span>
            </button>
          </li>
        {/each}
      </ul>

      {#if room?.gameId}
        <h2>事件を選ぶ</h2>
        <ul class="content-chips">
          {#each contents as content (content.id)}
            <li>
              <button
                class="content-chip"
                class:selected={room?.contentId === content.id}
                onclick={() => configure(content.id)}
              >
                {content.title}
              </button>
            </li>
          {/each}
        </ul>

        <label class="seconds">
          <span class="seconds-label">捜査時間（秒）</span>
          <input
            type="number"
            bind:value={investigationSeconds}
            min="300"
            max="1200"
            step="60"
            onchange={reconfigure}
          />
        </label>

        <button class="beb-btn yellow" onclick={start} disabled={!room?.contentId}><span>ゲームスタート</span></button>
      {/if}
    </section>
  {:else}
    <p class="waiting-note">ホストが始めるのを待っています…</p>
  {/if}
</main>

<style>
  .lobby {
    min-height: 100vh;
    background: linear-gradient(180deg, #63d2ff, #2fa6ee);
    color: #fff;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.1rem 1rem calc(1rem + var(--footer-clearance));
  }

  .room-chip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    background: var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.55rem 0.85rem;
    box-shadow: var(--shadow-hard);
  }
  .room-chip .lbl {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.68rem;
    color: var(--mist);
    letter-spacing: 0.1em;
  }
  .room-chip .code {
    font-family: var(--font-display);
    font-size: 1.35rem;
    color: var(--yellow);
    letter-spacing: 0.14em;
  }
  .qr-toggle {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.7rem;
    color: var(--ink);
    background: var(--yellow);
    border: none;
    border-radius: var(--radius-button);
    padding: 0.2rem 0.7rem;
    cursor: pointer;
  }

  .qr-panel {
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    border: var(--outline-width) solid var(--ink);
    box-shadow: var(--shadow-hard);
    padding: 0.75rem;
    text-align: center;
    max-width: 15rem;
    align-self: center;
  }
  .qr-panel p {
    margin: 0.4rem 0 0;
    font-size: 0.8rem;
  }

  .roster {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
  }

  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.82rem;
    letter-spacing: 0.06em;
    color: var(--ink);
    background: var(--yellow);
    border-radius: var(--radius-button);
    padding: 0.1rem 0.7rem;
    align-self: flex-start;
    margin: 0.6rem 0 0.4rem;
  }

  .host-controls {
    display: flex;
    flex-direction: column;
    margin-top: auto;
  }

  .title-cards,
  .content-chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .title-card {
    display: grid;
    gap: 0.1rem;
    text-align: left;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-tile);
    box-shadow: var(--shadow-tile);
    padding: 0.5rem 0.8rem;
    cursor: pointer;
  }
  .title-card.selected {
    outline: 4px solid var(--yellow);
    outline-offset: -2px;
  }
  .title-card-name {
    font-family: var(--font-display);
    font-size: 0.9rem;
  }
  .title-card-meta {
    font-size: 0.68rem;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }

  .content-chip {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.78rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-button);
    padding: 0.25rem 0.75rem;
    cursor: pointer;
  }
  .content-chip.selected {
    background: var(--blue);
    color: #fff;
  }

  .seconds {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.7rem 0;
  }
  .seconds-label {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    color: var(--ink);
    background: rgba(255, 255, 255, 0.85);
    border-radius: var(--radius-button);
    padding: 0.1rem 0.6rem;
  }
  .seconds input {
    width: 5.5rem;
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.3rem 0.5rem;
    font-variant-numeric: tabular-nums;
  }

  .waiting-note {
    margin-top: auto;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    color: var(--ink);
    background: rgba(255, 255, 255, 0.8);
    border-radius: var(--radius-button);
    padding: 0.35rem 0.9rem;
    align-self: center;
  }
</style>
