<!--
  結果（基本設計/15の結果と画面）。

  チームの順位と点、全ラウンドのお題と語の流れ、申告と異議の記録を出す。
  異議を出した人の名前を残すのは、申告を退けた異議が妥当だったかを場で振り返れるようにするためである。
  finishedのまま再接続した人へは共通コアが lastResult を再送するため、公開状態に依存しない。
  得点表は共通コアの ScoreBoard を使わない。ScoreBoard は1人1行の得点を受ける形であり、チームの得点を受けられない（15の結果）。
-->
<script lang="ts">
  import { sendCommon, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { STAGES, type MindMeldResult, type TeamAttempt, type TeamPublic } from "@beb/shared-mindmeld";
  import TeamChip from "./TeamChip.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    result: MindMeldResult | null;
    onLeave: () => void;
  }
  let { room, result, onLeave }: Props = $props();

  const isHost = $derived(room.players.some((player) => player.id === ui.myPlayerId && player.isHost));
  const winners = $derived(result === null ? [] : result.standings.filter((standing) => standing.place === 1));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function teamOf(teamId: string): TeamPublic | undefined {
    return result?.teams.find((team) => team.id === teamId);
  }

  function labelOf(teamId: string): string {
    return teamOf(teamId)?.label ?? teamId;
  }

  function verdictOf(entry: TeamAttempt): string {
    if (entry.exact) {
      return "✓ 一致";
    }
    if (entry.claim?.accepted === true) {
      return "✓ 申告で一致";
    }
    if (entry.claim?.accepted === false) {
      return "× 申告を退けた";
    }
    return "× ちがう";
  }
</script>

<main class="debrief beb-stage-radial">
  <StageTimer deadline={undefined} label={stageLabels[STAGES.debrief]} />

  <div class="body">
    {#if result}
      <section class="headline" data-testid="winner">
        <p class="title beb-zoom-in">
          {winners.length > 1 ? "DRAW!" : `TEAM ${labelOf(winners[0]?.teamId ?? "")} WINS!`}
        </p>
      </section>

      <section class="standings" data-testid="standings">
        <h2>順位</h2>
        <ol>
          {#each result.standings as standing (standing.teamId)}
            {@const team = teamOf(standing.teamId)}
            <li
              class:mine={team !== undefined && ui.myPlayerId !== null && team.memberIds.includes(ui.myPlayerId)}
              data-testid="standing"
              data-team-id={standing.teamId}
              data-place={standing.place}
            >
              <span class="place">{standing.place}位</span>
              {#if team}<TeamChip {team} {nameOf} withNames />{/if}
              <span class="points">{standing.points}点<span class="sub">（そろった {standing.matchedCount} / {result.rounds.length}）</span></span>
            </li>
          {/each}
        </ol>
      </section>

      {#each result.rounds as round (round.roundIndex)}
        <section class="round" data-testid="round-record">
          <h2>お題{round.roundIndex + 1}: <span class="en">{round.prompt.en}</span></h2>
          <p class="ja">{round.prompt.ja}</p>
          {#each round.attempts as attempt (attempt.attemptIndex)}
            <p class="attempt-head">{attempt.attemptIndex + 1}回目</p>
            <ul>
              {#each attempt.teams as entry (entry.teamId)}
                <li class:matched={entry.matched === true}>
                  <span class="label">{labelOf(entry.teamId)}</span>
                  <span class="words">
                    {entry.words.map((word) => word.word ?? "（なし）").join(" / ")}
                  </span>
                  <span class="verdict">{verdictOf(entry)}</span>
                  {#if entry.claim}
                    <span class="claim" data-testid="claim-record">
                      申告: {nameOf(entry.claim.claimedBy)} ／ 異議:
                      {entry.claim.objectorIds.length === 0 ? "なし" : entry.claim.objectorIds.map(nameOf).join("、")}
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
          {/each}
        </section>
      {/each}
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
  h2 .en {
    font-family: var(--font-body);
    font-size: 0.9rem;
    letter-spacing: normal;
    color: var(--panel);
  }
  .ja {
    margin: 0 0 0.3rem;
    font-size: 0.72rem;
    color: var(--mist);
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
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--ground-2);
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
  .sub {
    font-size: 0.7rem;
    font-weight: 400;
    color: var(--mist);
  }
  .attempt-head {
    margin: 0.35rem 0 0.2rem;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .round li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.2rem 0.5rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.55rem;
  }
  .round li.matched {
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--ground-2);
  }
  .label {
    font-family: var(--font-display);
  }
  .words {
    font-size: 0.92rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .verdict {
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .claim {
    grid-column: 1 / -1;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .waiting {
    margin: 0.6rem 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
  }
  .leave {
    margin-top: 0.6rem;
  }
</style>
