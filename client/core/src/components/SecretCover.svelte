<!--
  秘密を開く前の伏せ面と溜め（基本設計/02_クライアント.md、ビジュアルデザイン.mdの演出プリミティブ）。

  伏せ面 → タップ → 溜め → 中身 の3段階を共通コアが持つ。
  秘密を受け取っただけで中身を描画しないのは、隣の席から画面を見られる事故を防ぐためである。
  prefers-reduced-motionでは溜めを0にするが、伏せ面とタップは秘密保持の手段なので省略しない。

  何を開くかはゲームモジュールが children で渡す。共通コアは中身を知らない（不変条件4）。
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** 伏せ面の見出し（例: 役柄が届きました / あなたの番です） */
    title: string;
    /** 伏せ面の補足。既定は画面を見られていないかの確認を促す文言 */
    note?: string;
    /** 伏せ面のマーク。1文字程度の記号を想定する */
    mark?: string;
    /** E2Eから伏せ面を指すためのtestid */
    coverTestId?: string;
    children: Snippet;
  }
  let {
    title,
    note = "まわりに画面を見られていないか確認してから、タップして開いてください",
    mark = "?",
    coverTestId = "secret-cover",
    children,
  }: Props = $props();

  const SUSPENSE_MS = 600;

  type Phase = "cover" | "suspense" | "open";
  let phase = $state<Phase>("cover");

  function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function open(): void {
    if (phase !== "cover") {
      return;
    }
    if (prefersReducedMotion()) {
      phase = "open";
      return;
    }
    phase = "suspense";
    setTimeout(() => {
      phase = "open";
    }, SUSPENSE_MS);
  }
</script>

{#if phase === "cover"}
  <button class="cover beb-stripes-dark" onclick={open} data-testid={coverTestId}>
    <span class="cover-mark">{mark}</span>
    <p class="cover-title">{title}</p>
    <p class="cover-note">{note}</p>
  </button>
{:else if phase === "suspense"}
  <div class="suspense" aria-hidden="true"></div>
{:else}
  {@render children()}
{/if}

<style>
  /* 伏せ面は中身の色を出さない。中立色にする */
  .cover {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem 1.25rem;
    text-align: center;
    font-family: var(--font-body);
    border: none;
    width: 100%;
    overflow: hidden;
    background-color: var(--ground);
    color: var(--panel);
    cursor: pointer;
  }
  .cover-mark {
    font-family: var(--font-display);
    font-size: 4.5rem;
    line-height: 1;
    color: var(--yellow);
    transform: skew(var(--skew-angle)) rotate(-3deg);
    text-shadow: 0 6px 0 rgba(0, 0, 0, 0.4);
  }
  .cover-title {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 1.4rem;
    margin: 0;
  }
  .cover-note {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--mist);
  }

  .suspense {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--ground);
    animation: beb-wipe var(--motion-duration) var(--motion-easing);
  }
</style>
