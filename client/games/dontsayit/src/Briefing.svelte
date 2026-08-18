<!-- 3役と得点を1画面で示す → ready（ビジュアルデザイン.mdの画面別の要点、基本設計/09） -->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, STAGES, type DontSayItPublic } from "@beb/shared-dontsayit";
  import { faceColor, sendAction, ui } from "@beb/client-core";
  import ScoreBoard from "./ScoreBoard.svelte";
  import StageGuide from "./StageGuide.svelte";
  import StageTimer from "./StageTimer.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: DontSayItPublic;
  }
  let { room, publicState }: Props = $props();

  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function ready(): void {
    sendAction(ACTIONS.ready);
  }
</script>

<main class="briefing">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.briefing]} />

  <div class="body">
    <StageGuide step="briefing" />

    <h1 class="title">3つの役で回します</h1>

    <ul class="roles">
      <li class="speaker">
        <span class="role-name">説明者</span>
        <span class="role-desc">人物名を英語で説明する。禁止語を使うと1点減る</span>
      </li>
      <li class="watcher">
        <span class="role-name">監視役</span>
        <span class="role-desc">禁止語だけを見て違反を押す。このラウンドは答えない</span>
      </li>
      <li class="answerer">
        <span class="role-name">回答者</span>
        <span class="role-desc">声を聞いて人物名を当てる。当てると1点</span>
      </li>
    </ul>

    <h2>説明する順番</h2>
    <ol class="order">
      {#each publicState.speakerOrder as playerId, index (playerId)}
        <li class:me={playerId === ui.myPlayerId}>
          <span class="no">{index + 1}</span>
          <span class="face" style={`background:${faceColor(playerId)}`}></span>
          <span class="player">{nameOf(playerId)}</span>
        </li>
      {/each}
    </ol>

    <h2>得点</h2>
    <ScoreBoard {room} scores={publicState.scores} />

    <p class="progress">準備完了 {publicState.readyPlayerIds.length} / {connectedCount}</p>

    <button class="beb-btn red" onclick={ready} disabled={isReady}>
      <span>{isReady ? "他の人を待っています" : "準備できた"}</span>
    </button>
  </div>
</main>

<style>
  .briefing {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
  }

  .body {
    display: flex;
    flex-direction: column;
    padding: 0.9rem 0.9rem calc(0.9rem + var(--footer-clearance));
  }

  .title {
    font-family: var(--font-display);
    font-size: 1.6rem;
    margin: 0.2rem 0 0.7rem;
    transform: skew(var(--skew-angle));
    transform-origin: left bottom;
    text-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
  }

  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
    margin: 1rem 0 0.35rem;
  }

  /* 役の色はこの画面で決め、以降の画面でも同じ対応で使う */
  .roles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .roles li {
    display: grid;
    gap: 0.15rem;
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
    border-left: 6px solid var(--yellow);
    background: var(--ground-2);
  }
  .roles li.speaker {
    border-left-color: var(--red);
  }
  .roles li.watcher {
    border-left-color: var(--yellow);
  }
  .roles li.answerer {
    border-left-color: var(--blue);
  }
  .role-name {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.9rem;
  }
  .role-desc {
    font-size: 0.78rem;
    color: var(--mist);
    line-height: 1.5;
  }

  .order {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .order li {
    display: grid;
    grid-template-columns: 1.2rem 1.4rem 1fr;
    align-items: center;
    gap: 0.5rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.3rem 0.6rem;
    font-size: 0.82rem;
  }
  .order li.me {
    border-color: var(--yellow);
  }
  .no {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    color: var(--yellow);
    font-variant-numeric: tabular-nums;
  }
  .face {
    display: block;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.3);
  }

  .progress {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.8rem;
    color: var(--yellow);
    font-variant-numeric: tabular-nums;
    margin: 1rem 0 0.5rem;
  }
</style>
