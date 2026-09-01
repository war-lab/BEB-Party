<!--
  ラウンドの始まり。質問を全員へ見せ、自分に配られた言い方の例を出す（基本設計/11のステージ）。

  伏せ面のカットインは挟まない。他人に見られても失われる情報がないためである（基本設計/11）。
  「かくにんした」でreadyを送る。全員が揃うか締切に達すると英作文へ進む。判定はサーバが行う。
-->
<script lang="ts">
  import { ScoreBoard, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    HINT_BLANK,
    STAGES,
    type WhoWroteThisPublic,
    type WhoWroteThisSecret,
  } from "@beb/shared-whowrotethis";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: WhoWroteThisPublic;
    secret: WhoWroteThisSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const roundLabel = $derived(`${publicState.roundIndex + 1} / ${publicState.totalRounds}`);
  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  // このラウンドの秘密が届いているかを見る。前のラウンドの例を出さないため、roundIndexで照合する
  const mine = $derived(secret?.roundIndex === publicState.roundIndex ? secret : null);
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
</script>

<main class="briefing">
  <StageTimer deadline={room.deadline} label={`${stageLabels[STAGES.briefing]} ${roundLabel}`} />

  <div class="body">
    <StageGuide step="briefing" />

    <section class="question">
      <p class="q-en">{publicState.question.en}</p>
      <p class="q-ja">{publicState.question.ja}</p>
    </section>

    {#if mine && mine.hintEn.length > 0}
      <section class="hints" data-testid="my-hints">
        <h2>言い方の例</h2>
        <p class="note">{HINT_BLANK} は自分の言葉に置き換えてください。</p>
        <ul>
          {#each mine.hintEn as hint (hint)}
            <li>{hint}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if publicState.rounds.length > 0}
      <section class="scores">
        <h2>ここまでの得点</h2>
        <ScoreBoard {room} scores={publicState.scores} />
      </section>
    {/if}

    <button class="beb-btn yellow" data-testid="ready" disabled={isReady} onclick={() => sendAction(ACTIONS.ready)}>
      <span>{isReady ? "まっています…" : "かくにんした"}</span>
    </button>

    <p class="waiting" data-testid="ready-count">
      かくにん {publicState.readyPlayerIds.length} / {connectedCount}
    </p>
  </div>
</main>

<style>
  .briefing {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
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
    padding: 0.8rem;
  }
  .q-en {
    margin: 0 0 0.25rem;
    font-family: var(--font-display);
    font-size: 1.3rem;
    line-height: 1.25;
  }
  .q-ja {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .hints {
    margin: 0 0 1rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.55rem 0.7rem;
  }
  .hints h2,
  .scores h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .hints ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .hints .note {
    margin: 0 0 0.35rem;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .hints li {
    font-size: 0.9rem;
    line-height: 1.4;
  }
  .scores {
    margin: 0 0 1rem;
  }
  .waiting {
    margin: 0.6rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
