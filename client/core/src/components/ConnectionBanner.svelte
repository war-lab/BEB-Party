<script lang="ts">
  import { ui } from "../stores/ui.svelte";
</script>

{#if ui.connectionStatus === "connecting" || ui.connectionStatus === "reconnecting"}
  <div class="banner" role="status">再接続しています…</div>
{/if}

<style>
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
