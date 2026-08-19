<!--
  結果。得点表を1位から縦に並べ、その下に使い終えたお題、最後に重要表現を置く
  （ビジュアルデザイン.mdの画面別の要点）。

  未使用のカードは開示しない。同じセットを次のゲームでも使う（基本設計/09）。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { STAGES, type DontSayItPublic, type DontSayItResult } from "@beb/shared-dontsayit";
  import { sendCommon } from "@beb/client-core";
  import ScoreBoard from "./ScoreBoard.svelte";
  import StageGuide from "./StageGuide.svelte";
  import StageTimer from "./StageTimer.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: DontSayItPublic;
    result: DontSayItResult | null;
    onLeave: () => void;
  }
  let { room, publicState, result, onLeave }: Props = $props();

  const scores = $derived(result?.scores ?? publicState.scores);
  // 発表するのは最高得点の1人。同点なら先頭だけを出し、順位は下の得点表で見せる
  const winner = $derived([...scores].sort((a, b) => b.points - a.points)[0]);

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="debrief beb-stage-radial">
  <StageTimer deadline={undefined} label={stageLabels[STAGES.debrief]} />

  <div class="body">
    <StageGuide step="debrief" />

    <h1 class="title">結果</h1>
    {#if winner}
      <p class="winner-pre">TOP SCORE</p>
      <p class="winner beb-zoom-in" data-testid="winner">{nameOf(winner.playerId)}</p>
      <p class="winner-points">{winner.points}点</p>
    {/if}
    <ScoreBoard {room} {scores} highlightTop />

    {#if result}
      <h2>ラウンドの内訳</h2>
      <ul class="rounds">
        {#each result.rounds as round, index (index)}
          <li>
            <span class="no">{index + 1}</span>
            <span class="who">{nameOf(round.speakerPlayerId)}</span>
            <span class="num">成立 {round.solved}</span>
            <span class="num">違反 {round.violated}</span>
          </li>
        {/each}
      </ul>

      <h2>使ったお題</h2>
      <ul class="cards">
        {#each result.usedCards as used (used.answer)}
          <li class="beb-card">
            <p class="answer">{used.answer}</p>
            <ul class="taboo">
              {#each used.taboo as word (word)}
                <li>{word}</li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>

      <h2>覚えておきたい言い方</h2>
      <ul class="expressions">
        {#each result.keyExpressions as expression (expression.en)}
          <li>
            <span class="en">{expression.en}</span>
            <span class="ja">{expression.ja}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="waiting">結果を待っています…</p>
    {/if}

    <div class="after">
      <button class="beb-btn yellow" onclick={() => sendCommon({ type: "nextGame" })}>
        <span>ロビーへ戻る</span>
      </button>
      <button class="beb-btn ghost" onclick={onLeave}>
        <span>部屋を出る</span>
      </button>
    </div>
  </div>
</main>

<style>
  .debrief {
    min-height: 100vh;
    color: var(--panel);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
  }

  .body {
    display: flex;
    flex-direction: column;
    padding: 0.9rem 0.9rem calc(0.9rem + var(--footer-clearance));
  }

  .title {
    font-family: var(--font-display);
    font-size: 1.8rem;
    margin: 0.2rem 0 0.7rem;
    transform: skew(var(--skew-angle));
    transform-origin: left bottom;
    text-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
  }

  .winner-pre {
    margin: 0.6rem 0 0;
    text-align: center;
    font-family: var(--font-display);
    font-size: 0.95rem;
    color: var(--mist);
  }
  .winner {
    margin: 0;
    text-align: center;
    font-family: var(--font-display);
    font-size: 2.4rem;
    line-height: 1.1;
    transform: skew(var(--skew-angle)) rotate(-2deg);
    text-shadow: 0 6px 0 rgba(0, 0, 0, 0.35);
  }
  .winner-points {
    margin: 0 0 0.8rem;
    text-align: center;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.9rem;
    color: var(--yellow);
    font-variant-numeric: tabular-nums;
  }

  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
    margin: 1.2rem 0 0.35rem;
  }

  .rounds {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .rounds li {
    display: grid;
    grid-template-columns: 1.2rem 1fr auto auto;
    align-items: center;
    gap: 0.5rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
  }
  .no {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    color: var(--yellow);
    font-variant-numeric: tabular-nums;
  }
  .num {
    font-variant-numeric: tabular-nums;
    color: var(--mist);
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .cards .answer {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: 1.2rem;
    color: var(--ink);
  }
  .taboo {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .taboo li {
    background: var(--red);
    color: var(--panel);
    border-radius: var(--radius-button);
    padding: 0.15rem 0.5rem;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .expressions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .expressions li {
    display: grid;
    gap: 0.15rem;
    background: rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--blue);
    border-radius: 0 var(--radius-tile) var(--radius-tile) 0;
    padding: 0.4rem 0.7rem;
  }
  .expressions .en {
    font-weight: 700;
    font-size: 0.95rem;
  }
  .expressions .ja {
    font-size: 0.78rem;
    color: var(--mist);
  }

  .waiting {
    color: var(--mist);
  }

  .after {
    display: grid;
    gap: 0.5rem;
    margin-top: 1.2rem;
  }
</style>
