<!--
  「いまやること」の案内。進行役が台本を読まなくても卓が進むようにする。

  表示するのはサーバから届いた stage と役割だけで決まる文言であり、
  ステージ遷移も時間切れの判定も行わない（基本設計/02の禁止事項）。
-->
<script lang="ts">
  interface Props {
    step: "briefing" | "discussion" | "confirming" | "reveal";
    /** confirming で提案を入れる側かどうか */
    isHost?: boolean;
    /** reveal が最終ラウンドかどうか */
    isFinal?: boolean;
  }
  let { step, isHost = false, isFinal = false }: Props = $props();

  const text = $derived.by(() => {
    switch (step) {
      case "briefing":
        return "自分の目標を伏せ面から開いて覚えます。他の人には見せません。";
      case "discussion":
        return "5つを1位から5位まで英語で話し合います。自分の目標を通せるように主張してください。";
      case "confirming":
        return isHost
          ? "卓で決まった順位を並べて「この順位にする」を押します。全員が承認すると確定します。"
          : "ホストが入れた順位を見て、卓の合意どおりなら「承認」を押します。違うなら口で言ってください。";
      case "reveal":
        return isFinal
          ? "全員の目標と最終得点です。ここでゲームは終わりです。"
          : "確定した順位と全員の目標です。次のラウンドへ進むには「つづき」を押します。";
    }
  });
</script>

<p class="guide" data-testid="stage-guide">{text}</p>

<style>
  .guide {
    margin: 0 0 0.7rem;
    background: var(--ground-2);
    border-left: 4px solid var(--yellow);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
    font-family: var(--font-body);
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--mist);
  }
</style>
