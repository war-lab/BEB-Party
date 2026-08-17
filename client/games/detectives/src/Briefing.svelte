<!-- 事件概要 → 配役カットイン → ready（基本設計/02の画面対応、08） -->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import type { DetectivesPublic, DetectivesSecret } from "@beb/shared-detectives";
  import { ACTIONS } from "@beb/shared-detectives";
  import { sendAction, ui } from "@beb/client-core";
  import RoleCutIn from "./RoleCutIn.svelte";
  import StageTimer from "./StageTimer.svelte";

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

  function ready(): void {
    sendAction(ACTIONS.ready);
  }
</script>

<StageTimer deadline={room.deadline} />

<main class="briefing">
  <h1>{publicState.briefing.ja ? "事件の概要" : ""}</h1>
  <p class="ja">{publicState.briefing.ja}</p>
  <p class="en">{publicState.briefing.en}</p>

  <section class="cast">
    <h2>配役</h2>
    <ul>
      {#each publicState.cast as entry (entry.playerId)}
        <li>
          <span class="player">{room.players.find((p) => p.id === entry.playerId)?.name ?? entry.playerId}</span>
          <span class="character">{entry.characterName}</span>
        </li>
      {/each}
    </ul>
  </section>

  <p class="progress">準備完了 {publicState.readyPlayerIds.length} / {connectedCount}</p>

  <button class="primary" onclick={ready} disabled={isReady}>
    {isReady ? "他の人を待っています" : "準備できた"}
  </button>
</main>

{#if secret && !cutInClosed}
  <RoleCutIn isCulprit={secret.isCulprit} {characterName} onClose={() => (cutInClosed = true)} />
{/if}

<style>
  .briefing {
    min-height: 100vh;
    background: var(--sky);
    color: var(--ink);
    font-family: var(--font-body);
    padding: 1rem 1rem calc(1rem + var(--footer-clearance));
  }
  h1 {
    font-family: var(--font-display);
  }
  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
  }
  .ja {
    line-height: 1.7;
  }
  .en {
    background: var(--panel);
    border-radius: var(--radius-card);
    padding: 1rem;
    font-size: 1.1rem;
    line-height: 1.6;
  }
  .cast ul {
    list-style: none;
    padding: 0;
  }
  .cast li {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    border-bottom: 1px solid rgba(22, 27, 51, 0.2);
  }
  .character {
    font-weight: 700;
  }
  .progress {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
  }
  .primary {
    background: var(--red);
    color: white;
    border: none;
    border-radius: var(--radius-button);
    padding: 0.75rem 2rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    box-shadow: var(--shadow-hard);
  }
  .primary:disabled {
    background: #9aa0b5;
    box-shadow: none;
  }
</style>
