<!--
  色と形の英語名の早見表（基本設計/13の記号）。
  記号そのものには名前を添えないため、名前はこの表でだけ見られる。
-->
<script lang="ts">
  import { COLORS, COLOR_IDS, SHAPES, SHAPE_IDS, symbolIdOf } from "@beb/shared-escapecall";
  import SymbolIcon from "./SymbolIcon.svelte";
</script>

<div class="glossary" data-testid="glossary">
  <ul>
    {#each COLOR_IDS as color (color)}
      <li>
        <SymbolIcon symbol={symbolIdOf(color, "circle")} size={26} />
        <span class="en">{COLORS[color].en}</span>
        <span class="ja">{COLORS[color].ja}</span>
      </li>
    {/each}
  </ul>
  <ul>
    {#each SHAPE_IDS as shape (shape)}
      <li>
        <SymbolIcon symbol={symbolIdOf("blue", shape)} size={26} />
        <span class="en">{SHAPES[shape].en}</span>
        <span class="ja">{SHAPES[shape].ja}</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .glossary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--ground-2);
    border-radius: var(--radius-tile);
    padding: 0.2rem 0.45rem;
  }
  .en {
    font-size: 0.9rem;
    color: var(--panel);
  }
  .ja {
    margin-left: auto;
    font-size: 0.7rem;
    color: var(--mist);
  }
</style>
