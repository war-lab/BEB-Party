<!--
  テーマの選択肢6件。番号つきで並べる。番号は「Number four?」と口で指すためのものであり、テーマの中身を表さない（17の画面）。

  自分のテーマに「あなたのチーム」を添え、相手のテーマとして選べなくする。
  選べる形（answering）では、選択中の選択肢を背景の膜（--yellow-veil）で示す。黄の輪郭は使わない。
  系統は表示しない。明示すると本物のテーマが系統ごとに1件ずつであることが画面上の構造として見える（17の公開状態）。
-->
<script lang="ts">
  import type { ThemeChoice } from "@beb/shared-secretteams";

  interface Props {
    choices: ThemeChoice[];
    myThemeId: string | null;
    myLevel: number;
    /** 選べる形で出すときの選択中のid。undefined なら一覧として出す */
    selectedId?: string | null;
    onSelect?: (themeId: string) => void;
  }
  let { choices, myThemeId, myLevel, selectedId = undefined, onSelect }: Props = $props();

  const selectable = $derived(onSelect !== undefined);
</script>

<ol class="choices" data-testid="theme-choices">
  {#each choices as choice, index (choice.id)}
    {@const mine = choice.id === myThemeId}
    <li data-testid="theme-choice" data-theme-id={choice.id} data-mine={mine}>
      {#if selectable}
        <button
          type="button"
          class="option"
          class:selected={selectedId === choice.id}
          class:mine
          data-testid="theme-option"
          data-theme-id={choice.id}
          disabled={mine}
          aria-pressed={selectedId === choice.id}
          onclick={() => onSelect?.(choice.id)}
        >
          <span class="number">{index + 1}</span>
          <span class="text">
            <span class="en">{choice.en}</span>
            {#if myLevel <= 2}<span class="ja">{choice.ja}</span>{/if}
          </span>
          {#if mine}<span class="beb-pill self">あなたのチーム</span>{/if}
          {#if selectedId === choice.id}<span class="picked">相手のテーマ</span>{/if}
        </button>
      {:else}
        <div class="option" class:mine>
          <span class="number">{index + 1}</span>
          <span class="text">
            <span class="en">{choice.en}</span>
            {#if myLevel <= 2}<span class="ja">{choice.ja}</span>{/if}
          </span>
          {#if mine}<span class="beb-pill self">あなたのチーム</span>{/if}
        </div>
      {/if}
    </li>
  {/each}
</ol>
{#if myLevel > 2}
  <details class="ja-fold">
    <summary>選択肢の日本語</summary>
    <ol class="ja-list">
      {#each choices as choice, index (choice.id)}
        <li>{index + 1}. {choice.en}: {choice.ja}</li>
      {/each}
    </ol>
  </details>
{/if}

<style>
  .choices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
  }
  .option {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    background: var(--ground-2);
    color: var(--panel);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.5rem;
    font-family: var(--font-body);
    text-align: left;
  }
  button.option {
    cursor: pointer;
  }
  button.option:disabled {
    cursor: not-allowed;
    opacity: 0.75;
  }
  .option.selected {
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--ground-2);
  }
  .number {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--panel);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 0.8rem;
  }
  .text {
    display: grid;
    min-width: 0;
  }
  .en {
    font-size: 0.92rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .ja {
    font-size: 0.7rem;
    color: var(--mist);
  }
  .picked {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--yellow);
  }
  .ja-fold {
    margin: 0.35rem 0 0;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .ja-list {
    list-style: none;
    margin: 0.25rem 0 0;
    padding: 0;
  }
</style>
