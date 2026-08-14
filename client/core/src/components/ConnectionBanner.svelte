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
    padding: 0.5rem 1rem;
    background: var(--yellow);
    color: var(--ink);
    text-align: center;
    font-family: var(--font-body);
    font-weight: 700;
    z-index: 1000;
  }
</style>
