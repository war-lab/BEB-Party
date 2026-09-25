<!--
  自分の断片1つ（基本設計/13の断片）。並び・対応表・規則のどれかを描く。

  並びの記号に番号を振らない。番号があれば「1番は」と言えば済み、first / then / last のような
  順序の表現を使う理由が消える（13の画面）。
  E2Eが答えを組み立てられるよう、記号・数字・規則を data 属性にも持たせる。表示には使わない。
-->
<script lang="ts">
  import type { Piece } from "@beb/shared-escapecall";
  import SymbolIcon from "./SymbolIcon.svelte";

  interface Props {
    piece: Piece;
  }
  let { piece }: Props = $props();

  const partLabel = $derived(
    piece.kind === "rule" ? "" : piece.part === "front" ? "（前半）" : piece.part === "back" ? "（後半）" : "",
  );
</script>

{#if piece.kind === "order"}
  <section class="piece order" data-testid="piece-order" data-part={piece.part}>
    <h3>錠の記号{partLabel}<span class="sub">左から右へ</span></h3>
    <ol class="row">
      {#each piece.symbols as symbol, index (index)}
        <li data-symbol={symbol}><SymbolIcon {symbol} size={46} /></li>
      {/each}
    </ol>
    {#if piece.part === "back"}
      <p class="note">前半を持つ人の続きです。</p>
    {:else if piece.part === "front"}
      <p class="note">この後ろに、後半を持つ人の記号が続きます。</p>
    {/if}
  </section>
{:else if piece.kind === "map"}
  <section class="piece map" data-testid="piece-map" data-part={piece.part}>
    <h3>記号と数字の表{partLabel}</h3>
    <ul class="grid">
      {#each piece.entries as entry (entry.symbol)}
        <li data-symbol={entry.symbol} data-digit={entry.digit}>
          <SymbolIcon symbol={entry.symbol} size={36} />
          <span class="digit">{entry.digit}</span>
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <section class="piece rule" data-testid="piece-rule">
    <h3>読み方の規則<span class="sub">上から順に</span></h3>
    <ol class="rules">
      {#each piece.rules as rule, index (index)}
        <li data-rule-id={rule.ruleId} data-param={rule.param ?? ""}>
          <span class="en">{rule.textEn}</span>
          {#if rule.textJa}
            <span class="ja">{rule.textJa}</span>
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .piece {
    background: var(--ground-2);
    border: var(--outline-width) solid rgba(255, 255, 255, 0.18);
    border-radius: var(--radius-tile);
    padding: 0.55rem 0.65rem 0.65rem;
    margin: 0 0 0.6rem;
  }
  h3 {
    margin: 0 0 0.45rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.74rem;
    letter-spacing: 0.06em;
    color: var(--yellow);
  }
  .sub {
    margin-left: 0.5rem;
    font-size: 0.66rem;
    color: var(--mist);
    letter-spacing: 0;
  }
  .row {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.3rem;
  }
  .grid li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-tile);
    padding: 0.2rem 0.5rem;
  }
  .digit {
    font-family: var(--font-display);
    font-size: 1.5rem;
    color: var(--panel);
    font-variant-numeric: tabular-nums;
  }
  .rules {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.35rem;
  }
  .rules .en {
    display: block;
    font-size: 0.98rem;
    line-height: 1.4;
    color: var(--panel);
  }
  .rules .ja {
    display: block;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .note {
    margin: 0.35rem 0 0;
    font-size: 0.7rem;
    color: var(--mist);
  }
</style>
