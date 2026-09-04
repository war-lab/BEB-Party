<!--
  得点表。得点を持つゲームの結果・途中表示で使う（ADR-0020の判断基準で共通コアへ移した部品）。

  順位はサーバが並べた順（結果）か、その場の点数順（進行中）で描くだけとする。
  ゲーム固有の語彙を持たない。得点の意味・加点の規則は各ゲームモジュールが決める。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { faceColor } from "../face-color";
  import { playerIconOf } from "../player-icon";
  import type { ScoreEntry } from "../score-entry";
  import { ui } from "../stores/ui.svelte";

  interface Props {
    room: Room;
    scores: ScoreEntry[];
    /** 1位だけを大きく出す（結果画面） */
    highlightTop?: boolean;
  }
  let { room, scores, highlightTop = false }: Props = $props();

  const ranked = $derived([...scores].sort((a, b) => b.points - a.points));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<ul class="scores" data-testid="score-board">
  {#each ranked as entry, index (entry.playerId)}
    <li class:me={entry.playerId === ui.myPlayerId} class:top={highlightTop && index === 0}>
      <span class="rank">{index + 1}</span>
      <span class="face" style={`background:${faceColor(entry.playerId)}`}>
        <span aria-hidden="true">{playerIconOf(entry.playerId)}</span>
      </span>
      <span class="name">{nameOf(entry.playerId)}</span>
      <span class="points">{entry.points}</span>
    </li>
  {/each}
</ul>

<style>
  .scores {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .scores li {
    display: grid;
    grid-template-columns: 1.2rem 1.4rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.3rem 0.6rem;
    font-size: 0.82rem;
  }
  .scores li.me {
    border-color: var(--yellow);
  }
  .scores li.top {
    padding: 0.6rem;
  }
  .scores li.top .name,
  .scores li.top .points {
    font-family: var(--font-display);
    font-size: 1.3rem;
  }
  .rank {
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
  .points {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
