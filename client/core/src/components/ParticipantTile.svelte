<!-- 参加者タイル。格闘ゲームのキャラクターセレクトの文法（ビジュアルデザイン.md） -->
<script lang="ts">
  import type { Player } from "@beb/shared-core";
  import { faceColor } from "../face-color";

  interface Props {
    player: Player;
  }
  let { player }: Props = $props();
</script>

<div class="beb-tile" class:disconnected={!player.connected}>
  <div class="face" style={`background:${faceColor(player.id)}`}></div>
  <span class="tile-name">{player.name}</span>
  <span class="lv" aria-label={`レベル${player.level}`}>Lv.{player.level}</span>
  {#if player.isHost}
    <span class="host-badge">HOST</span>
  {/if}
  {#if !player.connected}
    <span class="disconnected-badge">切断中</span>
  {/if}
</div>

<style>
  .beb-tile {
    position: relative;
  }
  .beb-tile.disconnected {
    opacity: 0.55;
  }
  .host-badge {
    position: absolute;
    top: -0.55rem;
    right: -0.4rem;
    background: var(--red);
    color: #fff;
    border-radius: var(--radius-button);
    padding: 0.05rem 0.45rem;
    font-size: 0.62rem;
    font-family: var(--font-display);
    transform: rotate(6deg);
  }
  .disconnected-badge {
    display: block;
    font-size: 0.62rem;
    font-weight: 700;
    margin-top: 0.2rem;
    color: var(--ink-soft);
  }
</style>
