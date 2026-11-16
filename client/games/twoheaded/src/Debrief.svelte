<!--
  結果（16の結果と画面）。ペアごとの得点と順位、使ったお題と結果、重要表現を出す。

  finishedのまま再接続した人へは共通コアが lastResult を再送するため、公開状態に依存しない。
  同点は同じ順位として表示する（16の得点）。
-->
<script lang="ts">
  import { sendCommon, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { pairLabelOf, placesOf, STAGES, teamOf, type TwoHeadedResult, type UsedCardResult } from "@beb/shared-twoheaded";
  import PairChip from "./PairChip.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    result: TwoHeadedResult | null;
    onLeave: () => void;
  }
  let { room, result, onLeave }: Props = $props();

  const isHost = $derived(room.players.some((player) => player.id === ui.myPlayerId && player.isHost));
  const places = $derived(result === null ? new Map<string, number>() : placesOf(result.scores));
  const winners = $derived(result === null ? [] : result.scores.filter((score) => places.get(score.teamId) === 1));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function outcomeOf(card: UsedCardResult): string {
    if (card.outcome === "solved") {
      return `正解（${result === null ? "" : pairLabelOf(result.teams, card.guessedTeamId)}）`;
    }
    return card.outcome === "passed" ? "送り" : "時間切れ";
  }
</script>

<main class="debrief beb-stage-radial">
  <StageTimer deadline={undefined} label={stageLabels[STAGES.debrief]} />

  <div class="body">
    {#if result}
      <section class="headline" data-testid="winner">
        <p class="title beb-zoom-in">
          {winners.length > 1 ? "DRAW!" : `${pairLabelOf(result.teams, winners[0]?.teamId)} WINS!`}
        </p>
      </section>

      <section data-testid="standings">
        <h2>順位</h2>
        <ol class="standings">
          {#each result.scores as score (score.teamId)}
            {@const team = teamOf(result.teams, score.teamId)}
            <li
              class:mine={team !== undefined && ui.myPlayerId !== null && team.members.includes(ui.myPlayerId)}
              data-testid="standing"
              data-team-id={score.teamId}
              data-place={places.get(score.teamId)}
            >
              <span class="place">{places.get(score.teamId)}位</span>
              {#if team}<PairChip {team} teams={result.teams} {nameOf} withNames />{/if}
              <span class="points">{score.points}点</span>
            </li>
          {/each}
        </ol>
      </section>

      <section>
        <h2>使ったお題</h2>
        <ul class="cards">
          {#each result.usedCards as card, index (index)}
            <li data-testid="used-card" data-outcome={card.outcome} class:solved={card.outcome === "solved"}>
              <span class="label">{pairLabelOf(result.teams, card.teamId)}</span>
              <span class="answer">{card.answer}<span class="ja">{card.ja}</span></span>
              <span class="outcome">{outcomeOf(card)}</span>
            </li>
          {/each}
        </ul>
        {#if result.turns.some((turn) => turn.skipped)}
          <p class="note">説明役のペアがそろわず飛ばした手番があります。</p>
        {/if}
      </section>

      {#if result.keyExpressions.length > 0}
        <section data-testid="key-expressions">
          <h2>使える言い回し</h2>
          <ul class="expressions">
            {#each result.keyExpressions as expression (expression.en)}
              <li><span class="en">{expression.en}</span><span class="ja">{expression.ja}</span></li>
            {/each}
          </ul>
        </section>
      {/if}
    {:else}
      <p class="waiting">結果を受け取っています…</p>
    {/if}

    {#if isHost}
      <button class="beb-btn yellow" onclick={() => sendCommon({ type: "nextGame" })} data-testid="back-to-lobby">
        <span>ロビーへ戻る</span>
      </button>
    {:else}
      <p class="waiting" data-testid="waiting-host">ホストがロビーへ戻します。</p>
    {/if}
    <button class="beb-btn ghost leave" onclick={onLeave} data-testid="leave-room"><span>部屋を出る</span></button>
  </div>
</main>

<style>
  .debrief {
    min-height: 100vh;
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .headline {
    text-align: center;
    margin: 0 0 1rem;
  }
  .title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 2rem;
    color: var(--yellow);
    transform: skew(var(--skew-angle));
  }
  section {
    margin: 0 0 0.9rem;
  }
  h2 {
    margin: 0 0 0.35rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  ol,
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .standings li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.45rem 0.6rem;
  }
  .standings li.mine {
    border-color: var(--yellow);
  }
  .place {
    font-family: var(--font-display);
    font-size: 1.1rem;
    color: var(--yellow);
  }
  .points {
    margin-left: auto;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .cards li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.2rem 0.5rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.55rem;
  }
  .cards li.solved {
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--ground-2);
  }
  .label {
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .answer {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .answer .ja,
  .expressions .ja {
    margin-left: 0.4rem;
    font-size: 0.72rem;
    font-weight: 400;
    color: var(--mist);
  }
  .outcome {
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .expressions li {
    background: var(--ground-2);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.6rem;
  }
  .expressions .en {
    font-weight: 700;
  }
  .note,
  .waiting {
    margin: 0.6rem 0;
    font-size: 0.8rem;
    color: var(--mist);
  }
  .waiting {
    text-align: center;
  }
  .leave {
    margin-top: 0.6rem;
  }
</style>
