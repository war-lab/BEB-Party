<!--
  作者当て（基本設計/11のステージ）。

  開示中の提出を大きく出し、その下に候補タイルを並べる。
  作者が判明した人もタイルの明暗を変えずに残す（消去法の作業にしないため。ビジュアルデザイン）。
  自分の文が出ている端末には候補を出さない。指名は成立しない操作である。
-->
<script lang="ts">
  import { acquireWakeLock, faceColor, playerIconOf, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, STAGES, type WhoWroteThisPublic, type WhoWroteThisSecret } from "@beb/shared-whowrotethis";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: WhoWroteThisPublic;
    secret: WhoWroteThisSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const presented = $derived(publicState.presented);
  const itemLabel = $derived(presented === null ? "" : `${presented.index + 1} / ${presented.total}件目`);
  const hasGuessed = $derived(
    ui.myPlayerId !== null && (presented?.guessedPlayerIds.includes(ui.myPlayerId) ?? false),
  );
  // サーバは作者を伏せる。自分が作者かどうかは、手元の秘密（自分の提出）と一致するかで判定する。
  // サーバが正規化した文と同じ文字列が返るため一致する。
  // 2人の提出が完全に同じ文字列だった場合は両方が作者として表示される（11の未解決の論点）
  const mySubmission = $derived(secret?.roundIndex === publicState.roundIndex ? secret.submission : undefined);
  const isAuthor = $derived(presented !== null && mySubmission !== undefined && presented.text === mySubmission);
  const candidates = $derived(
    room.players.filter(
      (player) => publicState.submittedPlayerIds.includes(player.id) && player.id !== ui.myPlayerId,
    ),
  );
  const guessedCount = $derived(presented?.guessedPlayerIds.length ?? 0);
  const expectedCount = $derived(room.players.filter((player) => player.connected).length - 1);

  // 提出を読んで英語で言い合うステージ。指名を押すまで画面に触らない時間が続く
  $effect(() => acquireWakeLock());

  let picked = $state<string | null>(null);

  function guess(targetPlayerId: string): void {
    if (presented === null || hasGuessed) {
      return;
    }
    picked = targetPlayerId;
    sendAction(ACTIONS.guess, { index: presented.index, targetPlayerId });
  }
</script>

<main class="guessing">
  <StageTimer deadline={room.deadline} label={`${stageLabels[STAGES.guessing]} ${itemLabel}`} />

  <div class="body">
    <StageGuide step="guessing" isAuthor={isAuthor} />

    {#if presented}
      <section class="card" data-testid="presented-text">
        <p>{presented.text}</p>
      </section>

      {#if isAuthor}
        <p class="picked" data-testid="own-submission">これはあなたの文です。指名はできません。</p>
      {:else if hasGuessed}
        <p class="picked" data-testid="picked">
          指名しました。{picked === null ? "" : (room.players.find((player) => player.id === picked)?.name ?? "")}
        </p>
      {:else}
        <ul class="candidates" data-testid="candidate-list">
          {#each candidates as player (player.id)}
            <li>
              <button type="button" data-testid={`guess-${player.id}`} onclick={() => guess(player.id)}>
                <span class="face" style={`background:${faceColor(player.id)}`}>
                  <span aria-hidden="true">{playerIconOf(player.id)}</span>
                </span>
                <span class="name">{player.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <p class="waiting" data-testid="guessed-count">しめい {guessedCount} / {expectedCount}</p>
    {:else}
      <p class="waiting">しばらくお待ちください…</p>
    {/if}
  </div>
</main>

<style>
  .guessing {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .card {
    margin: 0 0 1rem;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 1rem 0.9rem;
  }
  .card p {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    line-height: 1.35;
  }
  .candidates {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.4rem;
  }
  .candidates button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--ground-2);
    color: var(--panel);
    border: var(--outline-width) solid rgba(255, 255, 255, 0.18);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.6rem;
    font-family: var(--font-body);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .candidates button:active {
    border-color: var(--yellow);
  }
  .face {
    display: block;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.3);
    text-align: center;
    line-height: 1.5rem;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .picked {
    margin: 0;
    padding: 0.6rem;
    text-align: center;
    background: var(--ground-2);
    border: 2px solid var(--yellow);
    border-radius: var(--radius-tile);
    font-size: 0.88rem;
  }
  .waiting {
    margin: 0.8rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
