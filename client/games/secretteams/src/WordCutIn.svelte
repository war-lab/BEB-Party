<!--
  自分の単語とテーマのカットイン（17の画面、ビジュアルデザイン.md）。

  伏せ面 → タップ → 溜め の3段階は共通コアの `SecretCover` が持つ。
  隣の席から覗かれる位置で単語が開くため、DETECTIVESの配役発表と同じ手順を踏む。
-->
<script lang="ts">
  import { SecretCover } from "@beb/client-core";
  import type { SecretTeamsSecret, ThemeChoice } from "@beb/shared-secretteams";

  interface Props {
    secret: SecretTeamsSecret;
    choices: ThemeChoice[];
    myLevel: number;
    onClose: () => void;
  }
  let { secret, choices, myLevel, onClose }: Props = $props();

  const theme = $derived(choices.find((choice) => choice.id === secret.themeId));
</script>

<SecretCover title="あなたの単語が届きました" coverTestId="word-cover">
  <div class="overlay beb-stage-reveal" data-testid="word-card">
    <div class="beb-caution top"></div>
    <div class="beb-cutin cutin">
      <p class="label">YOUR WORD</p>
      <p class="word">{secret.word.en}</p>
      {#if myLevel <= 2}<p class="ja">{secret.word.ja}</p>{/if}
      <p class="label theme-label">YOUR TEAM'S THEME</p>
      <p class="theme">{theme?.en ?? secret.themeId}</p>
      {#if myLevel <= 2 && theme}<p class="ja">{theme.ja}</p>{/if}
      <p class="hint">誰が味方かは知らされません。説明を聞いて見抜きます。</p>
    </div>
    <div class="beb-caution btm"></div>
    <p class="warning">他の人に見せない</p>
    <button class="beb-btn yellow confirm" data-testid="word-confirm" onclick={onClose}><span>確認した</span></button>
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
    background-color: var(--blue-deep);
    --beb-reveal-glow: #5b9bff;
    color: var(--panel);
  }
  .label {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
  }
  .theme-label {
    margin-top: 0.7rem;
  }
  .word {
    margin: 0.2rem 0 0;
    font-family: var(--font-display);
    font-size: 1.8rem;
    line-height: 1.2;
    color: var(--blue-deep);
    overflow-wrap: anywhere;
  }
  .theme {
    margin: 0.2rem 0 0;
    font-family: var(--font-display);
    font-size: 1.3rem;
    color: var(--ink);
  }
  .ja {
    margin: 0.15rem 0 0;
    font-size: 0.82rem;
    color: var(--ink-soft);
  }
  .hint {
    margin: 0.7rem 0 0;
    font-size: 0.78rem;
    color: var(--ink-soft);
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
