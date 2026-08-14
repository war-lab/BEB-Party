<script lang="ts">
  import type { Player } from "@beb/shared-core";

  interface Props {
    player: Player;
  }
  let { player }: Props = $props();
</script>

<div class="tile" class:disconnected={!player.connected}>
  <p class="name">{player.name}</p>
  <p class="stars" aria-label={`レベル${player.level}`}>{"★".repeat(player.level)}{"☆".repeat(5 - player.level)}</p>
  {#if player.isHost}
    <span class="host-badge">HOST</span>
  {/if}
  {#if !player.connected}
    <span class="disconnected-badge">切断中</span>
  {/if}
</div>

<style>
  .tile {
    position: relative;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-hard);
    padding: 0.75rem;
    text-align: center;
    font-family: var(--font-body);
  }
  .tile.disconnected {
    opacity: 0.5;
  }
  .name {
    font-weight: 700;
    margin: 0 0 0.25rem;
  }
  .stars {
    color: var(--yellow);
    margin: 0;
  }
  .host-badge {
    position: absolute;
    top: -0.5rem;
    right: -0.5rem;
    background: var(--red);
    color: white;
    border-radius: var(--radius-button);
    padding: 0.1rem 0.5rem;
    font-size: 0.7rem;
    font-family: var(--font-heading);
  }
  .disconnected-badge {
    display: block;
    font-size: 0.7rem;
    margin-top: 0.25rem;
  }
</style>
