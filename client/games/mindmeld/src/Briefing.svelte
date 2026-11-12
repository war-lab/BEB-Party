<!--
  遊び方の確認（基本設計/15のステージと画面）。

  遊び方、チームの一覧、申告の基準と例、口頭の約束、準備完了ボタンを出す。
  最初のお題はここでは出さない（15のステージ）。
-->
<script lang="ts">
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, MAX_ATTEMPTS, STAGES, type MindMeldPublic } from "@beb/shared-mindmeld";
  import ClaimRule from "./ClaimRule.svelte";
  import TeamChip from "./TeamChip.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: MindMeldPublic;
  }
  let { room, publicState }: Props = $props();

  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
  const hasTrio = $derived(publicState.teams.some((team) => team.memberIds.length === 3));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="briefing">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.briefing]} />

  <div class="body">
    <p class="guide" data-testid="stage-guide">チームを確かめて、遊び方と約束を読みます。</p>

    <section class="teams" data-testid="team-list">
      <h2>チーム</h2>
      <ul>
        {#each publicState.teams as team (team.id)}
          <li class:mine={ui.myPlayerId !== null && team.memberIds.includes(ui.myPlayerId)}>
            <TeamChip {team} {nameOf} withNames />
            {#if ui.myPlayerId !== null && team.memberIds.includes(ui.myPlayerId)}
              <span class="beb-pill self">あなた</span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <section class="how">
      <h2>遊び方</h2>
      <ul>
        <li>お題に合う英単語を、ペアの2人が同時に1つずつ出します。同じ語ならそろって成功です。</li>
        <li>そろわなかったら、次は<strong>2人が出した2語の両方につながる1語</strong>を出します。</li>
        <li>1つのお題で出せるのは{MAX_ATTEMPTS}回まで。1回目でそろうと{MAX_ATTEMPTS}点、{MAX_ATTEMPTS}回目なら1点です。</li>
        <li>お題の中の語と、そのお題でもう出た語（ほかのペアの語も）は出せません。</li>
        {#if hasTrio}
          <li>3人のチームは、毎回2人が語を出し、出す2人が交代します。</li>
        {/if}
      </ul>
    </section>

    <section class="claim">
      <h2>近い語の申告</h2>
      <p class="note">2語が少しだけ違うときは「同じ語」と申告できます。ほかのチームの過半数が異議を出すと認められません。</p>
      <ClaimRule withExamples />
    </section>

    <section class="promise" data-testid="oral-promises">
      <h2>約束</h2>
      <ul>
        <li>語を出している間は、出す語やその手がかりを口に出さない。</li>
        <li>開示では全員で <strong class="en">Three, two, one!</strong> と数え、one に合わせて自分の語を声に出す。</li>
      </ul>
    </section>

    <button class="beb-btn yellow" data-testid="ready" disabled={isReady} onclick={() => sendAction(ACTIONS.ready)}>
      <span>{isReady ? "準備できた" : "読んだ"}</span>
    </button>
    <p class="waiting" data-testid="ready-count">じゅんび {publicState.readyPlayerIds.length} / {connectedCount}</p>
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
  .guide {
    margin: 0 0 0.7rem;
    background: var(--ground-2);
    border: var(--outline-width) solid var(--yellow);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--mist);
  }
  section {
    margin: 0 0 0.9rem;
  }
  h2 {
    margin: 0 0 0.35rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  ul {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.25rem;
    font-size: 0.84rem;
    line-height: 1.5;
  }
  .teams ul {
    list-style: none;
    padding: 0;
    gap: 0.35rem;
  }
  .teams li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.55rem;
  }
  .teams li.mine {
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--ground-2);
  }
  .note {
    margin: 0 0 0.4rem;
    font-size: 0.82rem;
    line-height: 1.5;
  }
  .en {
    font-weight: 700;
  }
  .waiting {
    margin: 0.6rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
