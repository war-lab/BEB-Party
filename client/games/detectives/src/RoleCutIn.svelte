<!--
  配役カットイン（基本設計/02_クライアント.md「配役カットイン」）。

  伏せ面 → タップ → 溜め → 役柄カードの3段階で表示する。
  秘密受信だけで役柄を描画しないのは、隣の席から画面を見られる事故を防ぐためである。
  prefers-reduced-motionでは溜めを0にするが、伏せ面とタップは秘密保持の手段なので省略しない。
-->
<script lang="ts">
  interface Props {
    isCulprit: boolean;
    characterName: string;
    onClose: () => void;
  }
  let { isCulprit, characterName, onClose }: Props = $props();

  const SUSPENSE_MS = 600;

  type Phase = "cover" | "suspense" | "card";
  let phase = $state<Phase>("cover");

  function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function open(): void {
    if (phase !== "cover") {
      return;
    }
    if (prefersReducedMotion()) {
      phase = "card";
      return;
    }
    phase = "suspense";
    setTimeout(() => {
      phase = "card";
    }, SUSPENSE_MS);
  }
</script>

{#if phase === "cover"}
  <button class="cover" onclick={open} data-testid="role-cover">
    <p class="cover-title">役柄が届きました</p>
    <p class="cover-note">まわりに画面を見られていないか確認してから、タップして開いてください</p>
  </button>
{:else if phase === "suspense"}
  <div class="suspense" aria-hidden="true"></div>
{:else}
  <div class="card" class:culprit={isCulprit} data-testid="role-card">
    <p class="warning">他の人に見せない</p>
    <p class="role">{isCulprit ? "犯人" : "市民"}</p>
    <p class="character">{characterName}</p>
    <button class="confirm" onclick={onClose}>確認した</button>
  </div>
{/if}

<style>
  .cover,
  .suspense,
  .card {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
    font-family: var(--font-body);
  }
  /* 伏せ面は役柄の色を出さない。中立色にする */
  .cover {
    background: var(--ground);
    color: var(--panel);
    border: none;
    width: 100%;
  }
  .cover-title {
    font-family: var(--font-heading);
    font-size: 1.5rem;
    margin: 0;
  }
  .cover-note {
    margin: 0;
    font-size: 1rem;
    line-height: 1.6;
  }
  .suspense {
    background: var(--ground);
    animation: wipe var(--motion-duration) var(--motion-easing);
  }
  @keyframes wipe {
    from {
      clip-path: polygon(0 0, 0 0, 0 100%, 0 100%);
    }
    to {
      clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
    }
  }
  .card {
    background: var(--blue);
    color: white;
  }
  .card.culprit {
    background: var(--red);
  }
  .warning {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    margin: 0;
    padding: 0.5rem;
    background: var(--yellow);
    color: var(--ink);
    font-weight: 700;
  }
  .role {
    font-family: var(--font-heading);
    font-size: 3rem;
    margin: 0;
    transform: skewY(var(--skew-angle));
  }
  .character {
    font-size: 1.25rem;
    margin: 0;
  }
  .confirm {
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-button);
    padding: 0.75rem 2rem;
    font-family: var(--font-heading);
    box-shadow: var(--shadow-hard);
  }
</style>
