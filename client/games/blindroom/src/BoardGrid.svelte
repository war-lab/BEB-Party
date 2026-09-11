<!--
  3×3の盤面（基本設計/12_BLINDROOMゲームモジュール.md の座標を画面に出さない）。

  マスに番号・記号・行列のラベルを描かない。画面に座標があると説明が読み上げに退化し、
  英語の位置表現を使う理由が消える。読み上げ用のaria-labelには位置を語で入れる。
  視覚で見えている情報と同じであり、番号を与えるわけではない。
-->
<script lang="ts">
  import { CELL_COUNT, iconUrl, type Board, type PaletteItem } from "@beb/shared-blindroom";

  interface Props {
    cells: Board;
    palette: PaletteItem[];
    /** 見本。渡すと一致したマスに印を付ける（開示のみ） */
    sample?: Board | null;
    /** マスを押したときの操作。省略すると表示専用になる */
    onCellTap?: (index: number) => void;
    size?: "normal" | "small";
    testId?: string;
  }
  let { cells, palette, sample = null, onCellTap = undefined, size = "normal", testId }: Props = $props();

  // 読み上げ用の位置語。画面には出さない
  const POSITION_JA = [
    "上段の左",
    "上段の中央",
    "上段の右",
    "中段の左",
    "中央",
    "中段の右",
    "下段の左",
    "下段の中央",
    "下段の右",
  ];

  const indexes = Array.from({ length: CELL_COUNT }, (_, index) => index);

  function itemOf(id: string | null | undefined): PaletteItem | undefined {
    return id === null || id === undefined ? undefined : palette.find((entry) => entry.id === id);
  }

  function labelOf(index: number): string {
    const item = itemOf(cells[index]);
    return `${POSITION_JA[index] ?? ""}: ${item?.ja ?? "空き"}`;
  }

  function stateOf(index: number): "none" | "hit" | "miss" {
    if (sample === null) {
      return "none";
    }
    const expected = sample[index];
    if (expected === null || expected === undefined) {
      return "none";
    }
    return cells[index] === expected ? "hit" : "miss";
  }
</script>

<div class="grid" class:small={size === "small"} data-testid={testId}>
  {#each indexes as index (index)}
    {@const item = itemOf(cells[index])}
    {@const state = stateOf(index)}
    {#if onCellTap}
      <button
        type="button"
        class="cell"
        class:filled={item !== undefined}
        aria-label={labelOf(index)}
        data-testid={`cell-${index}`}
        onclick={() => onCellTap?.(index)}
      >
        {#if item}<img src={iconUrl(item.icon)} alt="" width="64" height="64" />{/if}
      </button>
    {:else}
      <div class="cell" class:filled={item !== undefined} class:hit={state === "hit"} class:miss={state === "miss"}>
        <span class="sr">{labelOf(index)}</span>
        {#if item}<img src={iconUrl(item.icon)} alt="" width="64" height="64" />{/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
    background: var(--ground-2);
    border-radius: var(--radius-card);
    padding: 0.35rem;
    /* 1マスの内側が約85pxになる幅。アイコンは64pxのSVGなので拡大しても崩れない */
    max-width: 18rem;
    margin: 0 auto;
  }
  .cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--panel);
    border: 2px solid rgba(0, 0, 0, 0.18);
    border-radius: var(--radius-tile);
    padding: 0;
    color: var(--ink);
  }
  .cell img {
    width: 85%;
    height: 85%;
  }
  /* 開示で並べる他人の盤面。1マス約44pxを確保する（小さすぎると外した位置を確かめられない） */
  .grid.small {
    gap: 0.25rem;
    padding: 0.25rem;
    max-width: 10.5rem;
  }
  .grid.small .cell {
    border-width: 2px;
  }
  button.cell {
    cursor: pointer;
  }
  button.cell:active {
    transform: scale(0.96);
  }
  .cell.hit {
    border-color: var(--yellow);
    box-shadow: inset 0 0 0 2px var(--yellow);
  }
  .cell.miss {
    border-color: var(--red);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
