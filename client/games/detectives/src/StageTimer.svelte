<!--
  上部固定のタイマーバー（ビジュアルデザイン.mdのモック `.timerbar`）。
  タイマーはサーバ権威であり、ここは受信したdeadlineを描くだけとする
  （時間切れの判定をクライアントで行わない。基本設計/02の禁止事項）
-->
<script lang="ts">
  import { serverState } from "@beb/client-core";

  interface Props {
    deadline: number | undefined;
    label: string;
  }
  let { deadline, label }: Props = $props();

  let now = $state(Date.now());

  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  // 端末時計のずれをサーバ時刻で補正する
  const offset = $derived(serverState.serverNow === null ? 0 : serverState.serverNow - now);
  const remainingSeconds = $derived(
    deadline === undefined ? null : Math.max(0, Math.ceil((deadline - (now + offset)) / 1000)),
  );

  function format(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
</script>

<div class="timerbar" data-testid="stage-timer">
  <span class="ph">{label}</span>
  {#if remainingSeconds !== null}
    <span class="t">{format(remainingSeconds)}</span>
  {/if}
</div>

<style>
  .timerbar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--yellow);
    color: var(--ink);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.55rem 0.9rem;
    border-bottom: 4px solid rgba(0, 0, 0, 0.25);
  }
  .ph {
    font-family: var(--font-display);
    font-size: 0.82rem;
  }
  .t {
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
  }
</style>
