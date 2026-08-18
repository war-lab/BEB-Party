<script lang="ts">
  import { CONNECT_FAILED } from "../connection";
  import { ui } from "../stores/ui.svelte";

  // 再接続をやめたときの理由。黙って「接続中…」のままにしない（基本設計/02）
  const FATAL_MESSAGES: Record<string, string> = {
    spectator_limit: "この部屋のホスト画面は上限（2台）に達しています",
    room_full: "この部屋は満員です",
    game_in_progress: "ゲームが進行中のため参加できません",
    room_not_found: "その部屋コードは見つかりません",
  };

  const fatalMessage = $derived(
    ui.connectionStatus === "disconnected" && ui.lastErrorCode ? FATAL_MESSAGES[ui.lastErrorCode] : undefined,
  );
</script>

{#if ui.lastErrorCode === CONNECT_FAILED}
  <div class="banner error" role="alert">部屋に接続できません。部屋コードを確認してください（混雑している場合もあります）</div>
{:else if fatalMessage}
  <div class="banner error" role="alert">{fatalMessage}</div>
{:else if ui.connectionStatus === "connecting"}
  <div class="banner" role="status">接続しています…</div>
{:else if ui.connectionStatus === "reconnecting"}
  <div class="banner" role="status">再接続しています…</div>
{/if}

<style>
  .banner.error {
    background: var(--red);
    color: #fff;
    text-shadow: none;
  }
  .banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 0.4rem 1rem;
    background: repeating-linear-gradient(45deg, var(--yellow) 0 16px, var(--ink) 16px 32px);
    color: var(--ink);
    text-align: center;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    z-index: 1100;
    /* 縞の上でも読めるよう、文字だけ白地の帯に乗せる */
    text-shadow:
      0 0 4px var(--panel),
      0 0 4px var(--panel),
      0 0 4px var(--panel);
  }
</style>
