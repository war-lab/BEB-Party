<!--
  「いまやること」の案内。進行役が台本を読まなくても卓が進むようにする。

  表示するのはサーバから届いた stage と役割だけで決まる文言であり、
  ステージ遷移も時間切れの判定も行わない（基本設計/02の禁止事項）。
-->
<script lang="ts">
  interface Props {
    step: "briefing" | "writing" | "guessing" | "judging" | "reveal";
    /** guessing で表示中の提出が自分のものかどうか */
    isAuthor?: boolean;
    /** reveal が最終ラウンドかどうか */
    isFinal?: boolean;
  }
  let { step, isAuthor = false, isFinal = false }: Props = $props();

  const text = $derived.by(() => {
    switch (step) {
      case "briefing":
        return "質問を読みます。自分に届いた言い方の例は他の人には見えていません。";
      case "writing":
        return "質問への答えを英語で1文書きます。自分らしさが出ないほど当てられにくくなります。";
      case "guessing":
        return isAuthor
          ? "いま出ているのはあなたの文です。指名はできません。まわりの話を聞いてください。"
          : "誰が書いた文かを英語で言い合ってから、書いた人だと思う席を選びます。";
      case "judging":
        return "作者と、誰が誰を指名したかが出ています。次の文へ自動で進みます。";
      case "reveal":
        return isFinal
          ? "全員の提出と最終得点です。ここでゲームは終わりです。"
          : "このラウンドの得点です。次のラウンドへ進むには「つづき」を押します。";
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
