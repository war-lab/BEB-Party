<!--
  議論のHUD（基本設計/10のステージ）。

  自分の目標と5項目、言い回しの例を同じ画面に出す。
  操作は無い。締切はサーバが持ち、到達すると順位の確定へ進む（基本設計/02の禁止事項）。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { STAGES, type RankingPublic, type RankingSecret } from "@beb/shared-ranking";
  import { acquireWakeLock, StageTimer } from "@beb/client-core";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: RankingPublic;
    secret: RankingSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const roundLabel = $derived(`${publicState.roundIndex + 1} / ${publicState.totalRounds}`);
  const myGoal = $derived(secret?.roundIndex === publicState.roundIndex ? secret : null);

  // 全員が画面を触らずに話し続けるステージ。スリープすると発言の途中でロック解除から始まる
  $effect(() => acquireWakeLock());
</script>

<main class="discussion">
  <StageTimer deadline={room.deadline} label={`${stageLabels[STAGES.discussion]} ${roundLabel}`} />

  <div class="body">
    <StageGuide step="discussion" />

    <section class="question">
      <p class="q-en">{publicState.question.en}</p>
      <p class="q-ja">{publicState.question.ja}</p>
    </section>

    {#if myGoal}
      <section class="goal" data-testid="my-goal">
        <h2>あなたの目標</h2>
        <p class="goal-ja">{myGoal.goal.ja}</p>
        <ul class="hints">
          {#each myGoal.goal.hintEn as hint (hint)}
            <li>{hint}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <ul class="items" data-testid="item-list">
      {#each publicState.items as item (item.id)}
        <li>
          <span class="en">{item.en}</span>
          <span class="ja">{item.ja}</span>
        </li>
      {/each}
    </ul>

    {#if publicState.keyExpressions.length > 0}
      <section class="phrases">
        <h2>使える言い方</h2>
        <ul>
          {#each publicState.keyExpressions as phrase (phrase.en)}
            <li>
              <span class="en">{phrase.en}</span>
              <span class="ja">{phrase.ja}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</main>

<style>
  .discussion {
    min-height: 100vh;
    background: linear-gradient(180deg, #0f1c3a, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .question {
    margin: 0 0 0.8rem;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 0.7rem 0.8rem;
  }
  .q-en {
    margin: 0 0 0.2rem;
    font-family: var(--font-display);
    font-size: 1.15rem;
    line-height: 1.25;
  }
  .q-ja {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .goal {
    margin: 0 0 0.9rem;
    background: var(--blue-deep);
    border: var(--outline-width) solid var(--blue);
    border-radius: var(--radius-card);
    padding: 0.6rem 0.75rem;
  }
  .goal h2,
  .phrases h2 {
    margin: 0 0 0.3rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .goal-ja {
    margin: 0 0 0.45rem;
    font-family: var(--font-display);
    font-size: 1.2rem;
    line-height: 1.25;
  }
  .hints {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
  }
  .hints li {
    font-size: 0.8rem;
    color: var(--panel);
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-button);
    padding: 0.2rem 0.5rem;
  }
  .items {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .items li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.45rem 0.7rem;
  }
  .items .en {
    font-family: var(--font-display);
    font-size: 1.05rem;
  }
  .items .ja,
  .phrases .ja {
    font-size: 0.72rem;
    color: var(--mist);
  }
  .phrases ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .phrases li {
    display: grid;
    gap: 0.1rem;
    background: var(--ground-2);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.6rem;
  }
  .phrases .en {
    font-size: 0.86rem;
    font-weight: 700;
  }
</style>
