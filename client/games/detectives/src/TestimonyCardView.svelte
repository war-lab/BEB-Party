<!--
  証言カード（ビジュアルデザイン.mdのモック `.card`）。
  英文を主、日本語ヒントを従として表示する（基本設計/02の禁止事項）。
-->
<script lang="ts">
  import type { TestimonyCard } from "@beb/shared-detectives";

  interface Props {
    card: TestimonyCard;
  }
  let { card }: Props = $props();
</script>

<article class="beb-card" class:lie={card.isLie} data-testid="testimony-card">
  <div class="tags">
    {#if card.disclosure === "on_question_only"}
      <span class="beb-pill lock">聞かれたら答える</span>
    {:else}
      <span class="beb-pill">自由に話してOK</span>
    {/if}
    {#if card.isLie}
      <span class="beb-pill lock">この証言は嘘</span>
    {/if}
  </div>
  <p class="en">{card.textEn}</p>
  <p class="ja">ヒント：{card.hintJa}</p>
</article>

<style>
  .beb-card {
    margin-bottom: 0.6rem;
  }
  .beb-card.lie {
    border-color: var(--red);
  }
  .tags {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
    margin-bottom: 0.4rem;
  }
  /* 英文が主。18px以上・高コントラスト（ビジュアルデザイン.md） */
  .en {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    line-height: 1.45;
    color: var(--ink);
  }
  /* 日本語ヒントは従。小さく低コントラストにする */
  .ja {
    margin: 0.35rem 0 0;
    padding-top: 0.35rem;
    border-top: 2px dashed #d5d9ec;
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
</style>
