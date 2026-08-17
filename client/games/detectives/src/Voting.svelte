<!-- 投票画面。容疑者グリッドから1人を選んで確定する（基本設計/02、08） -->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import type { DetectivesPublic } from "@beb/shared-detectives";
  import { ACTIONS } from "@beb/shared-detectives";
  import { sendAction, ui } from "@beb/client-core";
  import StageTimer from "./StageTimer.svelte";
  import { acquireWakeLock } from "./wake-lock.svelte";

  interface Props {
    room: Room;
    publicState: DetectivesPublic;
  }
  let { room, publicState }: Props = $props();

  let selected = $state<string | null>(null);

  const hasVoted = $derived(ui.myPlayerId !== null && publicState.votedPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
  const suspects = $derived(publicState.cast.filter((entry) => entry.playerId !== ui.myPlayerId));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function confirm(): void {
    if (selected === null) {
      return;
    }
    // 集計・勝敗はサーバが行う。ここは送るだけ（基本設計/02の禁止事項）
    sendAction(ACTIONS.vote, { targetPlayerId: selected });
  }

  $effect(() => acquireWakeLock());
</script>

<StageTimer deadline={room.deadline} />

<main class="voting">
  <h1>投票</h1>
  <p class="progress">投票済み {publicState.votedPlayerIds.length} / {connectedCount}</p>

  {#if hasVoted}
    <p class="done" data-testid="vote-done">投票しました。他の人を待っています。</p>
  {:else}
    <ul class="suspects">
      {#each suspects as suspect (suspect.playerId)}
        <li>
          <button
            class="suspect"
            class:selected={selected === suspect.playerId}
            onclick={() => (selected = suspect.playerId)}
          >
            <span class="name">{nameOf(suspect.playerId)}</span>
            <span class="character">{suspect.characterName}</span>
          </button>
        </li>
      {/each}
    </ul>
    <button class="primary" onclick={confirm} disabled={selected === null}>この人にする</button>
  {/if}
</main>

<style>
  .voting {
    min-height: 100vh;
    background: linear-gradient(160deg, var(--red) 0 50%, var(--blue) 50% 100%);
    color: white;
    font-family: var(--font-body);
    padding: 1rem;
  }
  h1 {
    font-family: var(--font-heading);
  }
  .suspects {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
  }
  .suspect {
    width: 100%;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-card);
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-family: var(--font-body);
  }
  .suspect.selected {
    outline: var(--outline-width) solid var(--yellow);
  }
  .name {
    font-weight: 700;
  }
  .character {
    font-size: 0.85rem;
  }
  .primary {
    margin-top: 1rem;
    background: var(--yellow);
    color: var(--ink);
    border: none;
    border-radius: var(--radius-button);
    padding: 0.75rem 2rem;
    font-family: var(--font-heading);
    box-shadow: var(--shadow-hard);
  }
  .primary:disabled {
    background: #9aa0b5;
    box-shadow: none;
  }
  .done {
    font-family: var(--font-heading);
  }
</style>
