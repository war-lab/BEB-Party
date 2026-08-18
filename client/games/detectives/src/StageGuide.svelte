<!--
  「いまやること」の案内。進行役が台本を読まなくても卓が進むようにする。

  表示するのはサーバから届いた `stage` と `deadline` だけで決まる文言であり、
  ステージ遷移も時間切れの判定も行わない（基本設計/02の禁止事項）。
  残り時間による切り替えは表示上の目安である。
-->
<script lang="ts">
  import { createServerClock } from "@beb/client-core";

  interface Props {
    /** 捜査ステージのみ残り時間で文言を切り替える。他ステージはundefinedでよい */
    deadline?: number | undefined;
    step: "briefing" | "investigation" | "voting";
    /** ホストにだけ出す補足（早めの切り上げなど） */
    hostNote?: string | undefined;
  }
  let { deadline = undefined, step, hostNote = undefined }: Props = $props();

  const clock = createServerClock();
  const remaining = $derived(clock.remaining(deadline));

  // 捜査は長いため、残り時間で「次にやること」を切り替える。
  // 全体の長さはロビーで変えられるので、割合ではなく残り時間の絶対値で判断する
  const investigationText = $derived.by(() => {
    if (remaining !== null && remaining <= 60) {
      return "まもなく投票です。怪しい人を1人に決めてください。";
    }
    if (remaining !== null && remaining <= 180) {
      return "まだ話していない人に質問してください。1人でも黙っていると真相に届きません。";
    }
    return "まず1周します。順番に自分の証言を1枚ずつ英語で読み上げてください。";
  });

  const text = $derived.by(() => {
    if (step === "briefing") {
      return "事件の概要を読み、役柄を確認したら「準備できた」を押してください。全員がそろうと捜査へ進みます。";
    }
    if (step === "voting") {
      return "犯人だと思う1人へ投票してください。自分には投票できません。投票は1回だけで、あとから変えられません。";
    }
    return investigationText;
  });
</script>

<p class="stage-guide" data-testid="stage-guide">
  <span class="tag">いまやること</span>
  <span class="text">{text}</span>
  {#if hostNote}
    <span class="host-note">{hostNote}</span>
  {/if}
</p>

<style>
  .stage-guide {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--yellow);
    border-radius: var(--radius-button);
    padding: 0.5rem 0.7rem;
    margin: 0 0 0.6rem;
    font-size: 0.82rem;
    line-height: 1.6;
  }
  .tag {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
  }
  .host-note {
    font-size: 0.74rem;
    color: var(--mist);
  }
</style>
