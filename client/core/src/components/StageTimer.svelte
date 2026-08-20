<!--
  上部固定のタイマーバー（ビジュアルデザイン.mdのモック `.timerbar`）。
  タイマーはサーバ権威であり、ここは受信したdeadlineを描くだけとする
  （時間切れの判定をクライアントで行わない。基本設計/02の禁止事項）。

  ステージ名と残り時間しか扱わずゲーム固有の概念を含まないため、共通コアに置く（不変条件4に触れない）。
  何をラベルに出すかはゲームモジュールが決める。deadlineがundefinedのステージでは時間を出さない。
-->
<script lang="ts">
  import { createServerClock, formatClock } from "../server-clock.svelte";

  interface Props {
    deadline: number | undefined;
    label: string;
  }
  let { deadline, label }: Props = $props();

  const clock = createServerClock();
  const remainingSeconds = $derived(clock.remaining(deadline));
</script>

<div class="timerbar" data-testid="stage-timer">
  <span class="ph">{label}</span>
  {#if remainingSeconds !== null}
    <span class="t">{formatClock(remainingSeconds)}</span>
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
