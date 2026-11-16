<!--
  説明の型、質問と返事の型、味方の推測を言う型。clue と answering に出す。
  自分のレベルが1〜2なら開いて出す（17のレベル差の吸収の第3層）。
-->
<script lang="ts">
  import type { KeyExpression } from "@beb/shared-secretteams";

  interface Props {
    expressions: KeyExpression[];
    myLevel: number;
  }
  let { expressions, myLevel }: Props = $props();
</script>

<details class="expressions" open={myLevel <= 2} data-testid="key-expressions">
  <summary>使える言い方</summary>
  <ul>
    {#each expressions as expression (expression.en)}
      <li><span class="en">{expression.en}</span><span class="ja">{expression.ja}</span></li>
    {/each}
  </ul>
</details>

<style>
  .expressions {
    margin: 0 0 0.9rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
  }
  summary {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  ul {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  li {
    display: grid;
  }
  .en {
    font-size: 0.9rem;
  }
  .ja {
    font-size: 0.72rem;
    color: var(--mist);
  }
</style>
