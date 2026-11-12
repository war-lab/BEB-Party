<!--
  カウントダウン・申告・異議・つなぎの理由の説明に使う言い回し。reveal に出す。
  自分のレベルが1〜2なら開いて出す（15の画面）。
-->
<script lang="ts">
  import type { KeyExpression } from "@beb/shared-mindmeld";

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
