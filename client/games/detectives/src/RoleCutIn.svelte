<!--
  配役カットイン（基本設計/02_クライアント.md「配役カットイン」、ビジュアルデザイン.mdのモック `.s-role`）。

  伏せ面 → タップ → 溜め の3段階は共通コアの `SecretCover` が持つ。
  ここは開いたあとの中身だけを組み立て、演出は共通プリミティブ（`beb-cutin` / `beb-caution` / `beb-stage-reveal`）を使う。
-->
<script lang="ts">
  import { SecretCover } from "@beb/client-core";

  interface Props {
    isCulprit: boolean;
    characterName: string;
    onClose: () => void;
  }
  let { isCulprit, characterName, onClose }: Props = $props();
</script>

<SecretCover title="役柄が届きました" coverTestId="role-cover">
  <div class="overlay beb-stage-reveal" class:culprit={isCulprit} data-testid="role-card">
    <div class="beb-caution top"></div>
    <div class="beb-cutin cutin">
      <p class="en">
        YOU ARE<br />
        {isCulprit ? "THE CULPRIT" : "A CITIZEN"}
      </p>
      <p class="ja">
        {isCulprit ? "あなたが犯人。嘘カードは1枚だけ。" : "あなたは市民。証言を突き合わせて犯人を探す。"}
      </p>
      <p class="character">{characterName}</p>
    </div>
    <div class="beb-caution btm"></div>
    <p class="warning">他の人に見せない</p>
    <button class="beb-btn yellow confirm" onclick={onClose}><span>確認した</span></button>
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
    /* 市民は青、犯人は赤。放射と縞はプリミティブが重ね、中心の光だけ役の色を渡す */
    background-color: var(--blue-deep);
    --beb-reveal-glow: #5b9bff;
    color: var(--panel);
  }
  .overlay.culprit {
    background-color: var(--red-deep);
    --beb-reveal-glow: #ff6b57;
  }

  .cutin .en {
    font-family: var(--font-display);
    font-size: 1.55rem;
    line-height: 1.2;
    margin: 0;
    color: var(--blue-deep);
  }
  .overlay.culprit .cutin .en {
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
