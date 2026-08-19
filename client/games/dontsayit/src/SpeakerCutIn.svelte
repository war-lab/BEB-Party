<!--
  説明者へのお題カットイン（ビジュアルデザイン.mdの画面別の要点、基本設計/09）。

  伏せ面 → タップ → 溜め の3段階は共通コアの `SecretCover` が持つ。
  正解を見てよいのは説明者だけであり、交代のたびに隣の席から覗かれる位置で開くため、
  DETECTIVESの配役発表と同じく伏せ面を挟む。
-->
<script lang="ts">
  import { SecretCover } from "@beb/client-core";
  import type { ConstraintCard, SpeakerSecret } from "@beb/shared-dontsayit";

  interface Props {
    secret: SpeakerSecret;
    constraint: ConstraintCard | null;
    onStart: () => void;
  }
  let { secret, constraint, onStart }: Props = $props();
</script>

<SecretCover title="あなたの番です" mark="!" coverTestId="speaker-cover">
  <div class="overlay beb-stage-reveal" data-testid="speaker-card">
    <div class="beb-caution top"></div>
    <div class="beb-cutin cutin">
      <p class="label">お題</p>
      <p class="answer">{secret.card.answer}</p>
      <p class="label">使えない語</p>
      <ul class="taboo">
        {#each secret.card.taboo as word (word)}
          <li>{word}</li>
        {/each}
      </ul>
      {#if constraint}
        <p class="constraint">{constraint.ja}（{constraint.en}）</p>
      {/if}
    </div>
    <div class="beb-caution btm"></div>
    <p class="warning">他の人に見せない</p>
    <button class="beb-btn yellow confirm" onclick={onStart}><span>はじめる</span></button>
  </div>
</SecretCover>

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
    width: 100%;
    overflow: hidden;
    /* 説明者は赤。役の色分けは3役の帯と揃える */
    background-color: var(--red-deep);
    --beb-reveal-glow: #ff6b57;
    color: var(--panel);
  }

  .cutin .label {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.64rem;
    letter-spacing: 0.1em;
    color: var(--red-deep);
    margin: 0 0 0.2rem;
  }
  .cutin .answer {
    font-family: var(--font-display);
    font-size: 1.9rem;
    line-height: 1.15;
    color: var(--ink);
    margin: 0 0 0.7rem;
    word-break: break-word;
  }
  .taboo {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.3rem;
  }
  .taboo li {
    background: var(--red);
    color: var(--panel);
    border-radius: var(--radius-button);
    padding: 0.2rem 0.55rem;
    font-size: 0.86rem;
    font-weight: 700;
  }
  .constraint {
    margin: 0.7rem 0 0;
    background: var(--yellow);
    color: var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.6rem;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .top {
    top: 9%;
  }
  .btm {
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
