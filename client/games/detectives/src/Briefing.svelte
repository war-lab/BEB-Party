<!-- 事件概要 → 配役カットイン → ready（基本設計/02の画面対応、08）。地はステージ共通の深紺 -->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, STAGES, type DetectivesPublic, type DetectivesSecret } from "@beb/shared-detectives";
  import { faceColor, sendAction, ui } from "@beb/client-core";
  import RoleCutIn from "./RoleCutIn.svelte";
  import StageTimer from "./StageTimer.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: DetectivesPublic;
    secret: DetectivesSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  let cutInClosed = $state(false);

  const characterName = $derived(
    publicState.cast.find((entry) => entry.playerId === ui.myPlayerId)?.characterName ?? "",
  );
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
    <h1 class="case-title">事件の概要</h1>

    <section class="beb-card brief">
      <p class="ja">{publicState.briefing.ja}</p>
      <p class="en">{publicState.briefing.en}</p>
    </section>

    <h2>配役</h2>
    <ul class="cast">
      {#each publicState.cast as entry (entry.playerId)}
        <li class:me={entry.playerId === ui.myPlayerId}>
          <span class="face" style={`background:${faceColor(entry.playerId)}`}></span>
          <span class="player">{nameOf(entry.playerId)}</span>
          <span class="character">{entry.characterName}</span>
        </li>
      {/each}
    </ul>

    <p class="progress">準備完了 {publicState.readyPlayerIds.length} / {connectedCount}</p>

    <button class="beb-btn red" onclick={ready} disabled={isReady}>
      <span>{isReady ? "他の人を待っています" : "準備できた"}</span>
    </button>
  </div>
</main>

{#if secret && !cutInClosed}
  <RoleCutIn isCulprit={secret.isCulprit} {characterName} onClose={() => (cutInClosed = true)} />
{/if}

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

  .case-title {
    font-family: var(--font-display);
    font-size: 1.75rem;
    margin: 0.2rem 0 0.7rem;
    transform: skew(var(--skew-angle));
    transform-origin: left bottom;
    text-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
  }

  .brief .ja {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink);
    line-height: 1.8;
  }
  .brief .en {
    margin: 0.5rem 0 0;
    padding-top: 0.5rem;
    border-top: 2px dashed #d5d9ec;
    font-size: 1rem;
    font-weight: 700;
    color: var(--ink);
    line-height: 1.5;
  }

  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
    margin: 1rem 0 0.35rem;
  }

  .cast {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .cast li {
    display: grid;
    grid-template-columns: 1.4rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.3rem 0.6rem;
    font-size: 0.82rem;
  }
  .cast li.me {
    border-color: var(--yellow);
  }
  .face {
    display: block;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.3);
  }
  .character {
    font-weight: 700;
    color: var(--mist);
    font-size: 0.75rem;
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
