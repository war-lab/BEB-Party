<!--
  説明役のペアが言えない語（16の「言えない語」）。

  画面に並べるのは、お題の名前・名前を空白とハイフンで区切った語・別名である。
  ひと続きの名前の構成要素（toothbrush の tooth と brush）と語形変化は機械で切り出せないため、規則の文で示す。
-->
<script lang="ts">
  interface Props {
    answer: string;
    aliases: string[];
  }
  let { answer, aliases }: Props = $props();

  const words = $derived.by(() => {
    const parts = answer.split(/[\s-]+/u).filter((part) => part !== "");
    const listed = [answer, ...(parts.length > 1 ? parts : []), ...aliases];
    // 大文字小文字だけが違う語を2回並べない
    const keys = listed.map((word) => word.toLowerCase());
    return listed.filter((word, index) => keys.indexOf(word.toLowerCase()) === index);
  });
</script>

<div class="forbidden" data-testid="forbidden-words">
  <p class="label">言えない語</p>
  <ul>
    {#each words as word (word)}
      <li>{word}</li>
    {/each}
  </ul>
  <p class="note">名前の中の語・語形変化（複数形・過去形・ing形）・日本語名も言えない</p>
</div>

<style>
  .forbidden {
    margin: 0 0 0.6rem;
  }
  .label {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.64rem;
    letter-spacing: 0.1em;
    margin: 0 0 0.25rem;
    opacity: 0.85;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  li {
    background: var(--red);
    color: var(--panel);
    border: 2px solid rgba(0, 0, 0, 0.25);
    border-radius: var(--radius-tile);
    padding: 0.2rem 0.55rem;
    font-size: 0.9rem;
    font-weight: 700;
  }
  .note {
    margin: 0.3rem 0 0;
    font-size: 0.72rem;
    opacity: 0.8;
  }
</style>
