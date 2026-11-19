<!--
  裏画面（`/room/:code?mode=backstage`）。主催者がペア戦のペアを指定する（ADR-0035）。
  どの画面からもリンクしない。参加者に数えない接続で入り、`secret` は届かない。
  表示はサーバから届いた `pinnedPairs` だけで決め、送信した時点で書き換えない（楽観更新をしない）。
  どのゲームが指定を使うかはカタログの `acceptsPinnedPairs` で決め、ゲームIDで分岐しない（ADR-0009）
-->
<script lang="ts">
  import { MAX_PINNED_PAIRS, playerIconEmoji, type GameSummary, type PinnedPair, type Player } from "@beb/shared-core";
  import { serverState } from "../stores/server-state.svelte";
  import { backstage } from "../stores/backstage.svelte";
  import { ui } from "../stores/ui.svelte";
  import { sendPinnedPairs } from "../connection";
  import { faceColor } from "../face-color";

  interface Props {
    code: string;
  }
  let { code }: Props = $props();

  let catalog = $state<GameSummary[]>([]);
  // 1人目にタップした参加者。2人目をタップした時点で組を送る
  let picking = $state<string | null>(null);
  let sendFailed = $state(false);

  $effect(() => {
    fetch("/api/catalog")
      .then((response) => response.json() as Promise<{ games: GameSummary[] }>)
      .then((body) => {
        catalog = body.games;
      })
      .catch(() => {
        catalog = [];
      });
  });

  const room = $derived(serverState.room);
  const pairs = $derived(backstage.pinnedPairs);
  const selectedGame = $derived(catalog.find((game) => game.id === room?.gameId));
  const pairingGames = $derived(catalog.filter((game) => game.acceptsPinnedPairs).map((game) => game.title));
  const pinnedIds = $derived(new Set((pairs ?? []).flat()));
  const full = $derived((pairs ?? []).length >= MAX_PINNED_PAIRS);

  // 届いた指定で組に入った人、または部屋からいなくなった人を選択中のままにしない
  $effect(() => {
    if (picking && (pinnedIds.has(picking) || !room?.players.some((player) => player.id === picking))) {
      picking = null;
    }
  });

  function playerOf(id: string): Player | undefined {
    return room?.players.find((player) => player.id === id);
  }

  function submit(next: PinnedPair[]): void {
    sendFailed = !sendPinnedPairs(next);
  }

  function pick(id: string): void {
    if (pairs === null || pinnedIds.has(id) || full) {
      return;
    }
    if (picking === null) {
      picking = id;
      return;
    }
    if (picking === id) {
      picking = null;
      return;
    }
    const first = picking;
    picking = null;
    submit([...pairs, [first, id]]);
  }

  function unpin(index: number): void {
    if (pairs === null) {
      return;
    }
    submit(pairs.filter((_, i) => i !== index));
  }

  function clearAll(): void {
    picking = null;
    submit([]);
  }

  const errorText = $derived.by(() => {
    if (ui.lastErrorCode === "backstage_limit") {
      return "この部屋の裏画面は同時に2つまでしか開けません。";
    }
    if (ui.lastErrorCode === "invalid_payload") {
      return "指定を保存できませんでした。参加者が入れ替わった可能性があります。";
    }
    if (sendFailed) {
      return "接続が切れているため送れませんでした。再接続後にもう一度操作してください。";
    }
    return null;
  });
</script>

<main class="backstage" data-testid="backstage-view">
  <header class="head">
    <span class="lbl">ペアの指定</span>
    <span class="code">{code}</span>
  </header>

  <section class="card note">
    <p>ここで指定した2人は、ペア戦の開始時に必ず同じペアになります。指定しなかった人は、これまでどおり自動で組みます。</p>
    <p>指定は参加者の画面には出ません。この画面を参加者に見せないでください。</p>
    <p class="game" data-testid="backstage-game-note">
      {#if selectedGame?.acceptsPinnedPairs}
        選択中の {selectedGame.title} では、指定が使われます。
      {:else if selectedGame}
        選択中の {selectedGame.title} では、指定は使われません。
      {:else}
        ゲームはまだ選ばれていません。
      {/if}
      {#if pairingGames.length > 0}
        <span class="games">指定を使うゲーム: {pairingGames.join(" / ")}</span>
      {/if}
    </p>
  </section>

  {#if errorText}
    <p class="error" role="alert">{errorText}</p>
  {/if}

  <section class="card" aria-label="指定済みの組">
    <h2>指定済みの組（{(pairs ?? []).length} / {MAX_PINNED_PAIRS}）</h2>
    {#if pairs === null}
      <p class="muted">読み込み中…</p>
    {:else if pairs.length === 0}
      <p class="muted">まだありません。下の参加者を2人続けてタップすると組になります。</p>
    {:else}
      <ul class="pairs">
        {#each pairs as [a, b], index (`${a}+${b}`)}
          <li class="pair" data-testid="backstage-pair" data-pair={`${a},${b}`}>
            <span class="pair-names">{playerOf(a)?.name ?? "?"} ＆ {playerOf(b)?.name ?? "?"}</span>
            <button class="small" data-testid="backstage-unpin" onclick={() => unpin(index)}>外す</button>
          </li>
        {/each}
      </ul>
      <button class="small wide" data-testid="backstage-clear" onclick={clearAll}>すべて外す</button>
    {/if}
  </section>

  <section class="card" aria-label="参加者">
    <h2>参加者</h2>
    {#if picking}
      <p class="muted">{playerOf(picking)?.name} と組ませる人をタップしてください。もう一度タップすると取り消します。</p>
    {:else if full}
      <p class="muted">指定できるのは{MAX_PINNED_PAIRS}組までです。</p>
    {/if}
    <ul class="roster">
      {#each room?.players ?? [] as player (player.id)}
        {@const pinned = pinnedIds.has(player.id)}
        <li>
          <button
            class="tile"
            class:selected={picking === player.id}
            class:pinned
            data-testid="backstage-player"
            data-player-id={player.id}
            disabled={pairs === null || pinned || (full && picking === null)}
            onclick={() => pick(player.id)}
          >
            <span class="face" style={`background:${faceColor(player.id)}`}>
              <span aria-hidden="true">{playerIconEmoji(player.icon)}</span>
            </span>
            <span class="name">{player.name}</span>
            <span class="lv">Lv.{player.level}</span>
            {#if pinned}
              <span class="tag">指定済み</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  </section>

  <!-- フッターの操作ボタンは出さないため、書体の表記だけを静的に置く（ビジュアルデザイン.md） -->
  <footer class="credit">書体: Dela Gothic One / M PLUS Rounded 1c（SIL Open Font License 1.1）</footer>
</main>

<style>
  .backstage {
    min-height: 100vh;
    background: var(--ground);
    color: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.2rem 1rem 2rem;
    max-width: 40rem;
    margin: 0 auto;
    font-family: var(--font-body);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .lbl {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    color: var(--mist);
    letter-spacing: 0.12em;
  }
  .code {
    font-family: var(--font-display);
    font-size: 1.8rem;
    color: var(--yellow);
    letter-spacing: 0.16em;
  }

  /* 強調は全周の輪郭と背景で出す。左端の色帯は使わない */
  .card {
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 0.9rem 1rem;
  }
  .card p {
    margin: 0 0 0.4rem;
    font-size: 0.9rem;
  }
  .card h2 {
    margin: 0 0 0.6rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 1rem;
  }
  .note .game {
    margin: 0;
    font-weight: 700;
  }
  .games {
    display: block;
    font-weight: 400;
    color: var(--ink-soft);
    font-size: 0.82rem;
  }
  .muted {
    color: var(--ink-soft);
  }
  .error {
    margin: 0;
    background: var(--red-veil);
    border: 2px solid var(--red);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.8rem;
    font-size: 0.88rem;
  }

  .pairs {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .pair {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    background: var(--yellow-veil);
    border: 2px solid var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.6rem;
  }
  .pair-names {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .small {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.82rem;
    background: var(--panel);
    color: var(--ink);
    border: 2px solid var(--ink);
    border-radius: var(--radius-button);
    padding: 0.2rem 0.8rem;
    cursor: pointer;
    flex-shrink: 0;
  }
  .small.wide {
    width: 100%;
  }

  .roster {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: 0.5rem;
  }
  .tile {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-tile);
    box-shadow: var(--shadow-tile);
    padding: 0.5rem 0.4rem;
    font-family: var(--font-body);
    cursor: pointer;
  }
  .tile.selected {
    background: var(--yellow);
  }
  .tile:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .face {
    --face-size: 2.2rem;
    border: var(--outline-width) solid var(--ink);
  }
  .name {
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .lv {
    font-size: 0.72rem;
    font-weight: 700;
    color: #fff;
    background: var(--blue);
    border-radius: var(--radius-button);
    padding: 0.02rem 0.5rem;
    font-variant-numeric: tabular-nums;
  }
  .tag {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--ink-soft);
  }

  .credit {
    margin-top: auto;
    font-size: 0.7rem;
    color: var(--mist);
    text-align: center;
  }
</style>
