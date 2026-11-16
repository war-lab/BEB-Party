<!--
  話す順。最初に話す人を大きく出し、続く人を矢印でつなぐ（16の画面）。

  1語ごとに表示を切り替えない。交互の手番は発話の中で閉じ、画面は順番を示すだけにする
  （16の「交互の手番は画面に話す順を示すだけにする」）。自分が最初なら「あなたから」と出す。
-->
<script lang="ts">
  import { faceColor, playerIconOf, ui } from "@beb/client-core";

  interface Props {
    order: string[];
    nameOf: (playerId: string) => string;
  }
  let { order, nameOf }: Props = $props();

  const first = $derived(order[0]);
  const rest = $derived(order.slice(1));
  const meFirst = $derived(ui.myPlayerId !== null && first === ui.myPlayerId);
</script>

{#if first !== undefined}
  <section class="order" data-testid="speaking-order" data-first-id={first}>
    <p class="tag">話す順（1語ずつ交互に）</p>
    <div class="first">
      <span class="face" style={`background:${faceColor(first)}`}>
        <span aria-hidden="true">{playerIconOf(first)}</span>
      </span>
      <span class="name">{nameOf(first)}</span>
      {#if meFirst}<span class="me" data-testid="you-first">あなたから</span>{/if}
    </div>
    <ol class="rest">
      {#each rest as playerId (playerId)}
        <li class:mine={playerId === ui.myPlayerId}>
          <span aria-hidden="true">→</span>
          {nameOf(playerId)}{playerId === ui.myPlayerId ? "（あなた）" : ""}
        </li>
      {/each}
      <li class="loop"><span aria-hidden="true">→</span> {nameOf(first)} …</li>
    </ol>
  </section>
{/if}

<style>
  .order {
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-card);
    padding: 0.55rem 0.75rem;
    margin: 0 0 0.8rem;
  }
  .tag {
    margin: 0 0 0.3rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
  }
  .first {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
  }
  .first .face {
    --face-size: 2.4rem;
    border: 3px solid rgba(0, 0, 0, 0.3);
  }
  .first .name {
    font-family: var(--font-display);
    font-size: 1.5rem;
    overflow-wrap: anywhere;
  }
  .me {
    background: var(--yellow);
    color: var(--ink);
    border-radius: var(--radius-button);
    padding: 0.15rem 0.55rem;
    font-weight: 700;
    font-size: 0.86rem;
  }
  .rest {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.7rem;
    font-size: 0.9rem;
    font-weight: 700;
  }
  .rest li.mine {
    color: var(--yellow);
  }
  .rest .loop {
    color: var(--mist);
    font-weight: 400;
  }
</style>
