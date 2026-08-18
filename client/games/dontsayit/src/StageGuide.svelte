<!--
  「いまやること」の案内。進行役が台本を読まなくても卓が進むようにする。

  表示するのはサーバから届いた stage と役だけで決まる文言であり、
  ステージ遷移も時間切れの判定も行わない（基本設計/02の禁止事項）。
-->
<script lang="ts">
  import type { Role } from "@beb/shared-dontsayit";

  interface Props {
    step: "briefing" | "handoff" | "explaining" | "debrief";
    /** 説明ステージのみ役で文言が変わる */
    role?: Role | undefined;
    /** その端末が次の説明者かどうか（交代ステージ） */
    isNextSpeaker?: boolean;
  }
  let { step, role = undefined, isNextSpeaker = false }: Props = $props();

  const explainingText = $derived.by(() => {
    if (role === "speaker") {
      return "禁止語を使わずに英語で説明してください。相手が言い当てたら「正解」を押し、当てた人を選びます。";
    }
    if (role === "watcher") {
      return "禁止語が出たら「違反」を押してください。このラウンドは答えを言わず、聞き役に回ります。";
    }
    return "画面を見る必要はありません。声を聞いて、英語でも日本語でも人物名を言い当ててください。";
  });

  const text = $derived.by(() => {
    if (step === "briefing") {
      return "3つの役と得点を確認したら「準備できた」を押してください。全員がそろうと1人目の説明者へ交代します。";
    }
    if (step === "handoff") {
      return isNextSpeaker
        ? "自分の番です。人物名と禁止語を読み、用意ができたら「はじめる」を押してください。押すと時間が動き出します。"
        : "次の説明者を待ってください。自分の番は上の順番で確認できます。";
    }
    if (step === "debrief") {
      return "得点と、使ったお題を振り返ります。重要表現は次の回で使えます。";
    }
    return explainingText;
  });
</script>

<p class="stage-guide" data-testid="stage-guide">
  <span class="tag">いまやること</span>
  <span class="text">{text}</span>
</p>

<style>
  .stage-guide {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--yellow);
    border-radius: 0 var(--radius-tile) var(--radius-tile) 0;
    margin: 0 0 0.8rem;
    padding: 0.5rem 0.7rem;
  }
  .tag {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
  }
  .text {
    font-size: 0.82rem;
    line-height: 1.6;
    color: var(--panel);
  }
</style>
