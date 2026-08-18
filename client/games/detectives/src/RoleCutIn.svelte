<!--
  配役カットイン（基本設計/02_クライアント.md「配役カットイン」、ビジュアルデザイン.mdのモック `.s-role`）。

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
  <button class="overlay cover beb-stripes-dark" onclick={open} data-testid="role-cover">
    <span class="cover-mark">?</span>
    <p class="cover-title">役柄が届きました</p>
    <p class="cover-note">まわりに画面を見られていないか確認してから、タップして開いてください</p>
  </button>
{:else if phase === "suspense"}
  <div class="overlay suspense" aria-hidden="true"></div>
{:else}
  <div class="overlay role beb-stripes-dark" class:culprit={isCulprit} data-testid="role-card">
    <div class="caution top"></div>
    <div class="cutin">
      <p class="en">
        YOU ARE<br />
        {isCulprit ? "THE CULPRIT" : "A CITIZEN"}
      </p>
      <p class="ja">
        {isCulprit ? "あなたが犯人。嘘カードは1枚だけ。" : "あなたは市民。証言を突き合わせて犯人を探す。"}
      </p>
      <p class="character">{characterName}</p>
    </div>
    <div class="caution btm"></div>
    <p class="warning">他の人に見せない</p>
    <button class="beb-btn yellow confirm" onclick={onClose}><span>確認した</span></button>
  </div>
{/if}

<style>
  .overlay {
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
  }

  /* 伏せ面は役柄の色を出さない。中立色にする */
  .cover {
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
    background: var(--ground);
    animation: wipe var(--motion-duration) var(--motion-easing);
  }
  @keyframes wipe {
    from {
      clip-path: polygon(0 0, 0 0, -20% 100%, -20% 100%);
    }
    to {
      clip-path: polygon(0 0, 120% 0, 100% 100%, -20% 100%);
    }
  }

  /* 市民は青、犯人は赤の放射地。縞はプリミティブ側で重ねる */
  .role {
    background-color: var(--blue-deep);
    background-image:
      repeating-linear-gradient(var(--skew-angle), rgba(0, 0, 0, 0.16) 0 22px, transparent 22px 44px),
      radial-gradient(circle at 50% 42%, #5b9bff 0%, var(--blue-deep) 68%);
  }
  .role.culprit {
    background-color: var(--red-deep);
    background-image:
      repeating-linear-gradient(var(--skew-angle), rgba(0, 0, 0, 0.16) 0 22px, transparent 22px 44px),
      radial-gradient(circle at 50% 42%, #ff6b57 0%, var(--red-deep) 68%);
  }

  .cutin {
    background: var(--panel);
    color: var(--ink);
    transform: skew(var(--skew-angle)) rotate(-2deg);
    padding: 1.4rem 1.25rem;
    width: 118%;
    border-top: 6px solid var(--ink);
    border-bottom: 6px solid var(--ink);
    box-shadow: 0 10px 0 rgba(0, 0, 0, 0.3);
    animation: cutin var(--motion-duration) var(--motion-easing);
  }
  @keyframes cutin {
    from {
      transform: skew(var(--skew-angle)) rotate(-2deg) scale(0.86);
      opacity: 0;
    }
    to {
      transform: skew(var(--skew-angle)) rotate(-2deg) scale(1);
      opacity: 1;
    }
  }
  .cutin .en {
    font-family: var(--font-display);
    font-size: 1.55rem;
    line-height: 1.2;
    margin: 0;
    color: var(--blue-deep);
  }
  .role.culprit .cutin .en {
    color: var(--red-deep);
  }
  .cutin .ja {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.88rem;
    margin: 0.4rem 0 0;
    color: var(--ink-soft);
  }
  .cutin .character {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.95rem;
    margin: 0.5rem 0 0;
    color: var(--ink);
  }

  /* 注意テープ。カットインの上下に走らせる */
  .caution {
    position: absolute;
    left: -10%;
    right: -10%;
    height: 1.6rem;
    background: repeating-linear-gradient(45deg, var(--yellow) 0 16px, var(--ink) 16px 32px);
    transform: rotate(-8deg);
  }
  .caution.top {
    top: 9%;
  }
  .caution.btm {
    bottom: 12%;
  }

  .warning {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    margin: 0;
    padding: 0.4rem;
    background: var(--yellow);
    color: var(--ink);
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
  }

  .confirm {
    position: absolute;
    bottom: calc(1.25rem + var(--footer-clearance));
    left: 1.25rem;
    right: 1.25rem;
    width: auto;
  }
</style>
