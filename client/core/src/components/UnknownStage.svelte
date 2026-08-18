<!--
  未知のgameId/stageに対する汎用の待機表示。
  デプロイ直後の古いSPAが新しいステージ名を知らない場合等に使う（基本設計/02_クライアント.md）
-->
<script lang="ts">
</script>

<main class="unknown">
  <p>しばらくお待ちください…</p>
</main>

<style>
  .unknown {
    min-height: 100vh;
    padding-bottom: var(--footer-clearance);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ground);
    color: var(--panel);
    font-family: var(--font-body);
  }
</style>
