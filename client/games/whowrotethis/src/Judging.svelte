<!--
  答え合わせ（基本設計/11のステージ）。

  作者と指名の内訳を12秒出す。操作は無い。締切はサーバが持ち、到達すると次の件か開示へ進む
  （基本設計/02の禁止事項）。
-->
<script lang="ts">
  import { faceColor, playerIconOf, StageTimer } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { POINTS_PER_HIDDEN, STAGES, type WhoWroteThisPublic } from "@beb/shared-whowrotethis";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: WhoWroteThisPublic;
  }
  let { room, publicState }: Props = $props();

  // 直前に答え合わせを終えた1件。revealedItemsの末尾が常にそれである
  const item = $derived(publicState.revealedItems[publicState.revealedItems.length - 1] ?? null);
  const itemLabel = $derived(item === null ? "" : `${item.index + 1} / ${publicState.presented?.total ?? 0}件目`);
  const correctCount = $derived(
    item === null ? 0 : item.guesses.filter((guess) => guess.targetPlayerId === item.authorId).length,
  );

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="judging">
  <StageTimer deadline={room.deadline} label={`${stageLabels[STAGES.judging]} ${itemLabel}`} />

  <div class="body">
    <StageGuide step="judging" />

    {#if item}
      <section class="card">
        <p class="text">{item.text}</p>
      </section>

      <section class="author" data-testid="author">
        <span class="face" style={`background:${faceColor(item.authorId)}`}>
          <span aria-hidden="true">{playerIconOf(item.authorId)}</span>
        </span>
        <span class="name">{nameOf(item.authorId)}</span>
        {#if correctCount === 0}
          <span class="badge" data-testid="hidden-badge">かくし通した +{POINTS_PER_HIDDEN}</span>
        {/if}
      </section>

      <ul class="guesses" data-testid="guess-breakdown">
        {#each item.guesses as guess (guess.playerId)}
          <li class:hit={guess.targetPlayerId === item.authorId}>
            <span class="who">{nameOf(guess.playerId)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span class="target">{nameOf(guess.targetPlayerId)}</span>
            <span class="mark">{guess.targetPlayerId === item.authorId ? "○" : "×"}</span>
          </li>
        {/each}
      </ul>

      <p class="summary" data-testid="correct-count">
        あてた人 {correctCount} / {item.guesses.length}
      </p>
    {:else}
      <p class="summary">しばらくお待ちください…</p>
    {/if}
  </div>
</main>

<style>
  .judging {
    min-height: 100vh;
    background:
      radial-gradient(circle at 50% 28%, rgba(255, 211, 77, 0.24), transparent 58%),
      linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .card {
    margin: 0 0 0.8rem;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 0.9rem;
  }
  .text {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.1rem;
    line-height: 1.35;
  }
  .author {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.9rem;
    background: var(--ground-2);
    border: 2px solid var(--yellow);
    border-radius: var(--radius-tile);
    padding: 0.6rem 0.7rem;
  }
  .author .name {
    font-family: var(--font-display);
    font-size: 1.35rem;
  }
  .face {
    display: block;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.3);
    text-align: center;
    line-height: 1.7rem;
  }
  .badge {
    margin-left: auto;
    font-size: 0.72rem;
    color: var(--yellow);
  }
  .guesses {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .guesses li {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto;
    align-items: center;
    gap: 0.4rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.3rem 0.6rem;
    font-size: 0.82rem;
  }
  .guesses li.hit {
    border-color: var(--yellow);
  }
  .arrow,
  .mark {
    color: var(--mist);
  }
  .guesses li.hit .mark {
    color: var(--yellow);
  }
  .target {
    text-align: right;
  }
  .summary {
    margin: 0.8rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
