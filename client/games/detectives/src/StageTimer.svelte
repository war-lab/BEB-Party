<!--
  ステージ締切の残り時間表示。タイマーはサーバ権威であり、ここは受信したdeadlineを描くだけとする
  （時間切れの判定をクライアントで行わない。基本設計/02の禁止事項）
-->
<script lang="ts">
  import { serverState } from "@beb/client-core";

  interface Props {
    deadline: number | undefined;
  }
  let { deadline }: Props = $props();

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
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }
</script>

{#if remainingSeconds !== null}
  <div class="timer" data-testid="stage-timer">残り {format(remainingSeconds)}</div>
{/if}

<style>
  .timer {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--yellow);
    color: var(--ink);
    /* 数字主体の短い文字列であり、表示書体でも潰れない */
    font-family: var(--font-display);
    font-size: 1.1rem;
    text-align: center;
    padding: 0.5rem;
  }
</style>
