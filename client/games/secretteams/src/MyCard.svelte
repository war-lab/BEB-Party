<!--
  自分の単語と自分のチームのテーマ。clue と answering では画面の下の方に置き、手元で確かめる位置にする（17の画面）。
  日本語は、レベル1〜2の画面では常に開き、レベル3〜5では折りたたむ（17のレベル差の吸収の第2層）。
  味方が誰かは載せない。秘密情報にも無い（17の秘密情報）。
-->
<script lang="ts">
  import type { SecretTeamsSecret, ThemeChoice } from "@beb/shared-secretteams";

  interface Props {
    secret: SecretTeamsSecret;
    choices: ThemeChoice[];
    myLevel: number;
  }
  let { secret, choices, myLevel }: Props = $props();

  const theme = $derived(choices.find((choice) => choice.id === secret.themeId));
  const number = $derived(choices.findIndex((choice) => choice.id === secret.themeId) + 1);
</script>

<section class="card beb-card" data-testid="my-card" data-theme-id={secret.themeId}>
  <div class="row">
    <span class="label">あなたの単語</span>
    <span class="en" data-testid="my-word">{secret.word.en}</span>
  </div>
  {#if myLevel <= 2}
    <p class="ja">{secret.word.ja}</p>
  {:else}
    <details class="ja-fold">
      <summary>日本語</summary>
      <p class="ja">{secret.word.ja}</p>
    </details>
  {/if}
  <div class="row theme">
    <span class="label">チームのテーマ</span>
    <span class="en" data-testid="my-theme">{number > 0 ? `${number}. ` : ""}{theme?.en ?? secret.themeId}</span>
  </div>
  {#if theme}
    {#if myLevel <= 2}
      <p class="ja">{theme.ja}</p>
    {:else}
      <details class="ja-fold">
        <summary>日本語</summary>
        <p class="ja">{theme.ja}</p>
      </details>
    {/if}
  {/if}
  <p class="note">単語とテーマ名はそのまま言わない。画面を他の人に見せない。</p>
</section>

<style>
  .card {
    margin: 0 0 0.9rem;
    padding: 0.6rem 0.8rem;
    color: var(--ink);
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .row.theme {
    margin-top: 0.4rem;
    border-top: 1px dashed rgba(0, 0, 0, 0.2);
    padding-top: 0.4rem;
  }
  .label {
    flex: none;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.7rem;
    color: var(--ink-soft);
  }
  .en {
    font-size: 1.15rem;
    font-weight: 700;
    overflow-wrap: anywhere;
    text-align: right;
  }
  .ja {
    margin: 0.1rem 0 0;
    font-size: 0.74rem;
    color: var(--ink-soft);
    text-align: right;
  }
  .ja-fold summary {
    font-size: 0.7rem;
    color: var(--ink-soft);
    text-align: right;
  }
  .note {
    margin: 0.4rem 0 0;
    font-size: 0.7rem;
    color: var(--ink-soft);
  }
</style>
