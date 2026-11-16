<!--
  説明の順番。2周とも同じ順に回す（17の「説明の順番は公開し、チームと独立に決める」）。

  手番の人は背景の膜と「いま説明している人」の文字で示し、色だけに頼らない。
  飛ばした手番は「不在のため飛ばした」と出す。チームは示さない（所属は誰にも配らない）。
-->
<script lang="ts">
  import { faceColor, playerIconOf, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { lapOf, type SecretTeamsPublic } from "@beb/shared-secretteams";

  interface Props {
    room: Room;
    publicState: SecretTeamsPublic;
    /** clue の進み具合（手番・飛ばした手番）を出すか。briefing では出さない */
    showProgress?: boolean;
  }
  let { room, publicState, showProgress = false }: Props = $props();

  const lap = $derived(lapOf(publicState));
  const lapStart = $derived((lap - 1) * publicState.speakerOrder.length);

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function stateOf(position: number): "current" | "skipped" | "done" | "waiting" {
    const turnIndex = lapStart + position;
    if (publicState.skippedTurns.includes(turnIndex)) {
      return "skipped";
    }
    if (turnIndex === publicState.turnIndex) {
      return "current";
    }
    return turnIndex < publicState.turnIndex ? "done" : "waiting";
  }
</script>

<ol class="order" data-testid="speaker-order">
  {#each publicState.speakerOrder as playerId, position (playerId)}
    {@const state = showProgress ? stateOf(position) : "waiting"}
    <li
      class:current={state === "current"}
      class:done={state === "done"}
      data-player-id={playerId}
      data-self={playerId === ui.myPlayerId}
      data-state={state}
    >
      <span class="position">{position + 1}</span>
      <span class="face" style={`background:${faceColor(playerId)}`} aria-hidden="true">{playerIconOf(playerId)}</span>
      <span class="name">{nameOf(playerId)}</span>
      {#if playerId === ui.myPlayerId}<span class="beb-pill self">あなた</span>{/if}
      {#if state === "current"}
        <span class="mark">いま説明している人</span>
      {:else if state === "skipped"}
        <span class="mark skipped">不在のため飛ばした</span>
      {/if}
    </li>
  {/each}
</ol>

<style>
  .order {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.3rem 0.55rem;
    font-size: 0.84rem;
  }
  li.current {
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--ground-2);
  }
  li.done {
    opacity: 0.6;
  }
  .position {
    flex: none;
    width: 1.2rem;
    text-align: center;
    font-family: var(--font-display);
    color: var(--mist);
  }
  .face {
    flex: none;
    width: 1.45rem;
    height: 1.45rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .name {
    overflow-wrap: anywhere;
  }
  .mark {
    margin-left: auto;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--yellow);
  }
  .mark.skipped {
    color: var(--mist);
  }
</style>
