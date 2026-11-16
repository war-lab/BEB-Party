<!--
  説明役のペアへのお題カットイン（16の画面「お題（伏せ面のカットインで開く）」）。

  伏せ面 → タップ → 溜め の3段階は共通コアの `SecretCover` が持つ。
  交代のたびに隣の席から覗かれる位置で開くため、DON'T SAY ITの説明者と同じく伏せ面を挟む。
  2人が同じお題を読み、どちらが先に話すかを確かめてから「はじめる」を押す。どちらが押してもよい。
-->
<script lang="ts">
  import { SecretCover } from "@beb/client-core";
  import type { ExplainerSecret } from "@beb/shared-twoheaded";
  import ForbiddenWords from "./ForbiddenWords.svelte";
  import SpeakingOrder from "./SpeakingOrder.svelte";

  interface Props {
    secret: ExplainerSecret;
    speakingOrder: string[];
    nameOf: (playerId: string) => string;
    onStart: () => void;
  }
  let { secret, speakingOrder, nameOf, onStart }: Props = $props();
</script>

<SecretCover title="あなたのペアの番です" mark="!" coverTestId="explainer-cover">
  <div class="overlay beb-stage-reveal" data-testid="explainer-card">
    <p class="warning">ほかのペアに見せない</p>
    <div class="beb-cutin cutin">
      <p class="label">お題</p>
      <p class="answer" data-testid="cutin-answer">{secret.card.answer}</p>
      <p class="answer-ja">{secret.card.ja}</p>
      <ForbiddenWords answer={secret.card.answer} aliases={secret.card.aliases} />
    </div>
    <div class="order">
      <SpeakingOrder order={speakingOrder} {nameOf} />
    </div>
    <button class="beb-btn yellow confirm" data-testid="start-turn" onclick={onStart}><span>はじめる</span></button>
  </div>
</SecretCover>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 0.6rem;
    padding: 2.4rem 1.1rem calc(5rem + var(--footer-clearance));
    text-align: center;
    font-family: var(--font-body);
    width: 100%;
    overflow-y: auto;
    background-color: var(--red-deep);
    --beb-reveal-glow: #ff6b57;
    color: var(--panel);
  }
  .cutin {
    color: var(--ink);
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
    margin: 0 0 0.15rem;
    word-break: break-word;
  }
  .cutin .answer-ja {
    font-size: 0.92rem;
    font-weight: 700;
    opacity: 0.72;
    margin: 0 0 0.6rem;
  }
  .order {
    text-align: left;
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
    position: fixed;
    bottom: calc(1.1rem + var(--footer-clearance));
    left: 1.1rem;
    right: 1.1rem;
    width: auto;
  }
</style>
