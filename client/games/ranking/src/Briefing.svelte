<!--
  ラウンドの始まり。項目セットを全員へ見せ、自分の目標を伏せ面で開く（基本設計/10のステージ）。

  目標を開いてから「かくにんした」を押すとreadyを送る。
  全員が揃うか締切に達すると議論へ進む。判定はサーバが行う。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, STAGES, type RankingPublic, type RankingSecret } from "@beb/shared-ranking";
  import { ScoreBoard, sendAction, StageTimer, ui } from "@beb/client-core";
  import GoalCutIn from "./GoalCutIn.svelte";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: RankingPublic;
    secret: RankingSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const roundLabel = $derived(`${publicState.roundIndex + 1} / ${publicState.totalRounds}`);
  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  // このラウンドの目標が届いているかを見る。前のラウンドの秘密を開かないため、roundIndexで照合する
  const myGoal = $derived(secret?.roundIndex === publicState.roundIndex ? secret : null);

  function confirm(): void {
    sendAction(ACTIONS.ready);
  }
</script>

<main class="briefing">
  <StageTimer deadline={room.deadline} label={`${stageLabels[STAGES.briefing]} ${roundLabel}`} />

  <div class="body">
    <StageGuide step="briefing" />

    <section class="question">
      <p class="q-en">{publicState.question.en}</p>
      <p class="q-ja">{publicState.question.ja}</p>
    </section>

    <ul class="items" data-testid="item-list">
      {#each publicState.items as item (item.id)}
        <li>
          <span class="en">{item.en}</span>
          <span class="ja">{item.ja}</span>
        </li>
      {/each}
    </ul>

    {#if publicState.rounds.length > 0}
      <section class="scores">
        <h2>ここまでの得点</h2>
        <ScoreBoard {room} scores={publicState.scores} />
      </section>
    {/if}

    <p class="waiting" data-testid="ready-count">
      かくにん {publicState.readyPlayerIds.length} / {room.players.filter((player) => player.connected).length}
    </p>
  </div>

  <!-- 目標が変わるたびに作り直す。同じインスタンスを残すと伏せ面が開いたまま次の目標が出る -->
  {#if myGoal && !isReady}
    {#key `${myGoal.roundIndex}:${myGoal.goal.id}`}
      <GoalCutIn secret={myGoal} onConfirm={confirm} />
    {/key}
  {/if}
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
  .items .ja {
    font-size: 0.72rem;
    color: var(--mist);
  }
  .scores {
    margin: 0 0 1rem;
  }
  .scores h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .waiting {
    margin: 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
