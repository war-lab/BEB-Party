<!--
  「いまやること」の案内。進行役が台本を読まなくても卓が進むようにする。

  表示するのはサーバから届いた stage と役割だけで決まる文言であり、
  ステージ遷移も時間切れの判定も行わない（基本設計/02の禁止事項）。
-->
<script lang="ts">
  interface Props {
    step: "briefing" | "handoff" | "building" | "reveal";
    /** そのラウンドの説明者かどうか */
    isDescriber?: boolean;
    /** reveal が最終ラウンドかどうか */
    isFinal?: boolean;
  }
  let { step, isDescriber = false, isFinal = false }: Props = $props();

  const text = $derived.by(() => {
    switch (step) {
      case "briefing":
        return "このラウンドで使うものの英語名を見ておきます。並べ方は説明者だけが見ます。";
      case "handoff":
        return isDescriber
          ? "あなたが説明者です。まわりに画面を見られていないか確認してから見本を開いてください。"
          : "説明者が見本を読んでいます。始まったら英語を聞いて同じ並びを作ります。";
      case "building":
        return isDescriber
          ? "見本を英語で伝えます。マスに番号を振って言うのはなしです。聞かれたら英語で答えてください。"
          : "説明を聞いて同じ並びを作ります。分からないところは英語で質問してください。";
      case "reveal":
        return isFinal
          ? "見本とみんなの盤面、最終得点です。ここでゲームは終わりです。"
          : "見本とみんなの盤面です。合っていたマスが点になります。次は説明者が交代します。";
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
