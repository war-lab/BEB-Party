<!--
  錠の記号1つ。4つの図形と4つの塗りの組み合わせをインラインSVGで描く（基本設計/13の記号）。

  画像ファイルを持たない。図形の定義をここに、塗りを shared の COLORS に持てば16種が描ける。
  記号に英語名を添えない。名前が書いてあれば読み上げるだけになり、色と形を英語で言う工程が消える。

  記号は明るい下地の上に濃い輪郭で描く。暗い地にじかに置くと、黒の記号が輪郭だけの白い図形に見え、
  "white triangle" と読まれる（390px幅の実画面で確認した）。
-->
<script lang="ts">
  import { COLORS, colorOf, shapeOf, type SymbolId } from "@beb/shared-escapecall";

  interface Props {
    symbol: SymbolId;
    size?: number;
  }
  let { symbol, size = 44 }: Props = $props();

  const fill = $derived(COLORS[colorOf(symbol)].fill);
  const shape = $derived(shapeOf(symbol));
</script>

<svg class="symbol" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" data-symbol={symbol}>
  <rect class="backdrop" x="0" y="0" width="40" height="40" rx="7" />
  {#if shape === "star"}
    <polygon
      class="mark"
      points="20,4 24.6,14.6 36,15.6 27.4,23.2 30,34.4 20,28.5 10,34.4 12.6,23.2 4,15.6 15.4,14.6"
      fill={fill}
    />
  {:else if shape === "circle"}
    <circle class="mark" cx="20" cy="20" r="14" fill={fill} />
  {:else if shape === "triangle"}
    <polygon class="mark" points="20,5 35,33 5,33" fill={fill} />
  {:else}
    <rect class="mark" x="7" y="7" width="26" height="26" rx="2" fill={fill} />
  {/if}
</svg>

<style>
  .symbol {
    display: block;
    flex: none;
  }
  .backdrop {
    fill: #f7f8fd;
  }
  .mark {
    stroke: #161b33;
    stroke-width: 2;
    stroke-linejoin: round;
  }
</style>
