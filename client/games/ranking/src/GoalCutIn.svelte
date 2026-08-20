<!--
  秘密の目標のカットイン（ビジュアルデザイン.mdの画面別の要点、基本設計/10）。

  伏せ面 → タップ → 溜め の3段階は共通コアの `SecretCover` が持つ。
  目標は自分だけが見てよい情報であり、卓を囲んだ状態で開くため伏せ面を挟む。
-->
<script lang="ts">
  import { SecretCover } from "@beb/client-core";
  import type { RankingSecret } from "@beb/shared-ranking";

  interface Props {
    secret: RankingSecret;
    onConfirm: () => void;
  }
  let { secret, onConfirm }: Props = $props();
</script>

<SecretCover title="あなたの目標です" mark="!" coverTestId="goal-cover">
  <div class="overlay beb-stage-reveal" data-testid="goal-card">
    <div class="beb-caution top"></div>
    <div class="beb-cutin cutin">
      <p class="label">目標</p>
      <p class="goal">{secret.goal.ja}</p>
      <p class="label">言い方の例</p>
      <ul class="hints">
        {#each secret.goal.hintEn as hint (hint)}
          <li>{hint}</li>
        {/each}
      </ul>
    </div>
    <div class="beb-caution btm"></div>
    <p class="warning">他の人に見せない</p>
    <button class="beb-btn yellow confirm" onclick={onConfirm} data-testid="goal-confirm"><span>かくにんした</span></button>
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
    /* 目標は青。DETECTIVESの市民と同系にし、赤（犯人・説明者）と役割の色を混ぜない */
    background-color: var(--blue-deep);
    --beb-reveal-glow: #5b9bff;
    color: var(--panel);
  }

  .cutin .label {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.64rem;
    letter-spacing: 0.1em;
    color: var(--blue-deep);
    margin: 0 0 0.2rem;
  }
  .cutin .goal {
    font-family: var(--font-display);
    font-size: 1.5rem;
    line-height: 1.25;
    color: var(--ink);
    margin: 0 0 0.7rem;
    word-break: break-word;
  }
  .hints {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
    text-align: left;
  }
  .hints li {
    background: var(--blue);
    color: var(--panel);
    border-radius: var(--radius-button);
    padding: 0.25rem 0.55rem;
    font-size: 0.82rem;
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
