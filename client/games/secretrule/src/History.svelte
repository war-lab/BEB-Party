<!--
  これまでに判定した英文の一覧（基本設計/14の画面）。

  成否は自分の英文にだけ出す。他人の英文には成否を出さず、報告を書き留める欄も置かない。
  報告を聞き取る工程を画面が代わらないためである（ADR-0031）。
-->
<script lang="ts">
  import { faceColor, playerIconOf } from "@beb/client-core";
  import type { OwnResult, TestedEntry } from "@beb/shared-secretrule";

  interface Props {
    entries: TestedEntry[];
    /** 自分の英文の成否（秘密情報） */
    results: OwnResult[];
    myPlayerId: string | null;
    nameOf: (playerId: string) => string;
    /** このラウンドの分だけを出すときに指定する */
    onlyRound?: number;
    title?: string;
  }
  let { entries, results, myPlayerId, nameOf, onlyRound, title = "試した英文" }: Props = $props();

  const shown = $derived(onlyRound === undefined ? entries : entries.filter((entry) => entry.roundIndex === onlyRound));

  function ownResult(entry: TestedEntry): OwnResult | undefined {
    if (entry.playerId !== myPlayerId) {
      return undefined;
    }
    return results.find((result) => result.roundIndex === entry.roundIndex && result.text === entry.text);
  }
</script>

{#if shown.length > 0}
  <section class="history" data-testid="history">
    <h2>{title}</h2>
    <ul>
      {#each shown as entry (`${entry.roundIndex}:${entry.playerId}`)}
        {@const own = ownResult(entry)}
        <li data-testid="tested-entry" data-player-id={entry.playerId}>
          <span class="who">
            <span class="face" style={`background:${faceColor(entry.playerId)}`}>
              <span aria-hidden="true">{playerIconOf(entry.playerId)}</span>
            </span>
            <span class="name">{nameOf(entry.playerId)}</span>
            {#if onlyRound === undefined}<span class="round">R{entry.roundIndex + 1}</span>{/if}
          </span>
          <span class="text">{entry.text}</span>
          {#if own}
            <span class="verdict" class:pass={own.passed} data-testid="own-verdict" data-passed={own.passed}>
              {own.passed ? "○ 通過" : "× 不通過"}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .history {
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
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  li {
    display: grid;
    gap: 0.2rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.45rem 0.6rem;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .face {
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
  }
  .round {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .text {
    font-size: 0.95rem;
    line-height: 1.4;
    color: var(--panel);
  }
  .verdict {
    justify-self: start;
    font-size: 0.8rem;
    font-weight: 700;
    border-radius: var(--radius-tile);
    padding: 0.1rem 0.5rem;
    background: var(--panel);
    color: var(--ink);
  }
  .verdict.pass {
    background: var(--yellow);
  }
</style>
