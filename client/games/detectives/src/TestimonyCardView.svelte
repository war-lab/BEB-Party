<!--
  証言カード。英文を主、日本語ヒントを従として表示する（基本設計/02の禁止事項）。
  日本語だけ読んで済ませる動機を作らないため、英文より小さく低コントラストにする。
-->
<script lang="ts">
  import type { TestimonyCard } from "@beb/shared-detectives";

  interface Props {
    card: TestimonyCard;
  }
  let { card }: Props = $props();
</script>

<article class="card" class:lie={card.isLie} data-testid="testimony-card">
  {#if card.isLie}
    <p class="lie-badge">この証言は嘘</p>
  {/if}
  <p class="en">{card.textEn}</p>
  <p class="hint">{card.hintJa}</p>
  {#if card.disclosure === "on_question_only"}
    <p class="disclosure">聞かれたときだけ答える</p>
  {/if}
</article>

<style>
  .card {
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-hard);
    padding: 1rem;
    margin-bottom: 1rem;
    font-family: var(--font-body);
  }
  .card.lie {
    border-color: var(--red);
  }
  .lie-badge {
    margin: 0 0 0.5rem;
    color: var(--red);
    font-family: var(--font-heading);
    font-size: 0.9rem;
  }
  /* 英文が主。18px以上・高コントラスト（ビジュアルデザイン.md） */
  .en {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.5;
    font-weight: 700;
    color: var(--ink);
  }
  /* 日本語ヒントは従。小さく低コントラストにする */
  .hint {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: #5b6076;
  }
  .disclosure {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    color: var(--ink);
    background: var(--yellow);
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: var(--radius-button);
  }
</style>
