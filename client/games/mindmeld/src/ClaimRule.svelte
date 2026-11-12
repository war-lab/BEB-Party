<!--
  近い語の申告の基準（15の「近い語の申告と異議」）。briefing と reveal に常に出す。
  基準の文言は正本と揃える。
-->
<script lang="ts">
  interface Props {
    /** 例を並べるか。reveal では基準の1文だけにする */
    withExamples?: boolean;
  }
  let { withExamples = false }: Props = $props();
</script>

<section class="rule" data-testid="claim-rule">
  <p class="text">
    複数形、つづりの英米差、1〜2文字の打ち間違いは同じ語として認める。意味の違う語は認めない。
  </p>
  {#if withExamples}
    <ul>
      <li><span class="en">apple / apples</span>、<span class="en">color / colour</span> → 同じ語（申告できる）</li>
      <li><span class="en">cat / car</span> → 申告はできるが別の語。異議を出してよい</li>
      <li><span class="en">pan / cook</span> → 近い語でないので申告できない</li>
    </ul>
  {/if}
</section>

<style>
  .rule {
    margin: 0 0 0.9rem;
    background: var(--ground-2);
    border: var(--outline-width) solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
  }
  .text {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    font-weight: 700;
  }
  ul {
    margin: 0.35rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.2rem;
    font-size: 0.78rem;
    line-height: 1.45;
  }
  .en {
    font-weight: 700;
  }
</style>
