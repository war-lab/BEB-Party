<!--
  お題。英文を大きく置き、日本語は小さく低コントラストで添える（捜査画面と同じ階層）。
  ja はレベル1〜2の画面では常に開き、レベル3〜5では折りたたむ（15のレベル差の吸収の第2層）。
-->
<script lang="ts">
  import type { PromptPublic } from "@beb/shared-mindmeld";

  interface Props {
    prompt: PromptPublic;
    myLevel: number;
  }
  let { prompt, myLevel }: Props = $props();
</script>

<section class="prompt beb-card" data-testid="prompt">
  <p class="en" data-testid="prompt-en">{prompt.en}</p>
  {#if myLevel <= 2}
    <p class="ja">{prompt.ja}</p>
  {:else}
    <details class="ja-fold">
      <summary>日本語</summary>
      <p class="ja">{prompt.ja}</p>
    </details>
  {/if}
</section>

<style>
  .prompt {
    margin: 0 0 0.8rem;
    padding: 0.7rem 0.85rem;
    color: var(--ink);
  }
  .en {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 700;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .ja {
    margin: 0.2rem 0 0;
    font-size: 0.76rem;
    color: var(--ink-soft);
  }
  .ja-fold summary {
    margin-top: 0.2rem;
    font-size: 0.72rem;
    color: var(--ink-soft);
  }
</style>
