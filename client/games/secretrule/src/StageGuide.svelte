<!--
  「いまやること」の案内。進行役が台本を読まなくても卓が進むようにする。

  表示するのはサーバから届いた stage で決まる文言であり、
  ステージ遷移も時間切れの判定も行わない（基本設計/02の禁止事項）。
-->
<script lang="ts">
  interface Props {
    step: "briefing" | "writing" | "choosing" | "checking" | "proving";
    /** checking で自分の英文が判定にかかったかどうか */
    isTested?: boolean;
  }
  let { step, isTested = false }: Props = $props();

  const text = $derived.by(() => {
    switch (step) {
      case "briefing":
        return "候補の規則を読みます。通ったかどうかは、書いた本人の画面にしか出ません。自分の画面はほかの人に見せないでください。";
      case "writing":
        return "どの候補か見分けられそうな英文を1つ書きます。試すのは2つだけなので、出す前に英語で相談しても構いません。";
      case "choosing":
        return "全員の下書きが出ています。どの2つを試すかを英語で相談し、試したい下書きに印を付けます。";
      case "checking":
        return isTested
          ? "あなたの英文の結果が出ています。通ったかどうかを英語で伝えてください（Mine passed. / Mine failed.）。そのあと、規則だと思う候補を選びます。"
          : "試した英文を書いた人に、通ったかどうかを英語で聞いてください。そのあと、規則だと思う候補を選びます。";
      case "proving":
        return "規則が分かりました。その規則を満たし、もう1つの候補は満たさない英文を書きます。";
    }
  });
</script>

<p class="guide" data-testid="stage-guide">{text}</p>

<style>
  .guide {
    margin: 0 0 0.7rem;
    background: var(--ground-2);
    border: var(--outline-width) solid var(--yellow);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
    font-family: var(--font-body);
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--mist);
  }
</style>
