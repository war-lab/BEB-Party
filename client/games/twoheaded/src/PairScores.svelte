<!--
  ペアごとの得点。共通コアの ScoreBoard は1人1行の得点を受ける形であり、ペアの得点を受けられない（15の結果と同じ判断）。
  自分のペアの行は輪郭と「あなたのペア」の文字の両方で示す。
-->
<script lang="ts">
  import { ui } from "@beb/client-core";
  import { teamOf, type TeamPublic, type TeamScore } from "@beb/shared-twoheaded";
  import PairChip from "./PairChip.svelte";

  interface Props {
    teams: TeamPublic[];
    scores: TeamScore[];
    nameOf: (playerId: string) => string;
    /** 説明役のペア。行に印を付ける */
    explainerTeamId?: string | undefined;
  }
  let { teams, scores, nameOf, explainerTeamId = undefined }: Props = $props();
</script>

<ul class="scores" data-testid="pair-scores">
  {#each scores as score (score.teamId)}
    {@const team = teamOf(teams, score.teamId)}
    <li
      class:mine={team !== undefined && ui.myPlayerId !== null && team.members.includes(ui.myPlayerId)}
      data-testid="pair-score"
      data-team-id={score.teamId}
    >
      {#if team}<PairChip {team} {teams} {nameOf} />{/if}
      {#if score.teamId === explainerTeamId}<span class="explaining">説明中</span>{/if}
      <span class="points">{score.points}点</span>
    </li>
  {/each}
</ul>

<style>
  .scores {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.6rem;
  }
  li.mine {
    border-color: var(--yellow);
  }
  .explaining {
    font-size: 0.68rem;
    color: var(--yellow);
    font-weight: 700;
  }
  .points {
    margin-left: auto;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
