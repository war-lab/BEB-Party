<!--
  書体のライセンス表記画面（ビジュアルデザイン.md）。
  OFLライセンス全文はclient/public/fonts/*.OFL.txtとして配信物に同梱している
-->
<script lang="ts">
  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();
</script>

<div class="overlay">
  <div class="panel">
    <h2>書体のライセンス</h2>
    <ul>
      <li>
        <strong>Dela Gothic One</strong><br />
        Copyright 2020 The Dela Gothic Project Authors<br />
        <a href="/fonts/dela-gothic-one.OFL.txt" target="_blank" rel="noopener">SIL Open Font License 1.1 全文</a>
      </li>
      <li>
        <strong>M PLUS Rounded 1c</strong><br />
        Copyright 2016 The Rounded M+ Project Authors<br />
        <a href="/fonts/m-plus-rounded-1c.OFL.txt" target="_blank" rel="noopener">SIL Open Font License 1.1 全文</a>
      </li>
    </ul>
    <button onclick={onClose}>閉じる</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }
  .panel {
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    padding: 1.5rem;
    max-width: 90vw;
    font-family: var(--font-body);
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    margin-bottom: 1rem;
  }
</style>
