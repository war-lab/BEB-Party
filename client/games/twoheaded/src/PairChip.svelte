<!--
  ペアの見出し。ラベル（ペア1〜4）とメンバーの顔アイコンで示す。
  参加者の顔色は8色をハッシュで割り当てるため、ペアの色としては使わない（15のTeamChipと同じ判断、ADR-0033）。
  自分のペアは色だけでなく「あなたのペア」の文字で示す（16の画面）。
-->
<script lang="ts">
  import { faceColor, playerIconOf, ui } from "@beb/client-core";
  import { pairLabelOf, type TeamPublic } from "@beb/shared-twoheaded";

  interface Props {
    team: TeamPublic;
    teams: TeamPublic[];
    nameOf: (playerId: string) => string;
    /** 名前も並べるか。狭い行ではアイコンだけにする */
    withNames?: boolean;
  }
  let { team, teams, nameOf, withNames = false }: Props = $props();

  const mine = $derived(ui.myPlayerId !== null && team.members.includes(ui.myPlayerId));
</script>

<span class="pair" data-testid="pair-chip" data-team-id={team.teamId}>
  <span class="label">{pairLabelOf(teams, team.teamId)}</span>
  {#each team.members as memberId (memberId)}
    <span class="member">
      <span class="face" style={`background:${faceColor(memberId)}`} role="img" aria-label={nameOf(memberId)}>
        <span aria-hidden="true">{playerIconOf(memberId)}</span>
      </span>
      {#if withNames}<span class="name">{nameOf(memberId)}</span>{/if}
    </span>
  {/each}
  {#if mine}<span class="beb-pill self">あなたのペア</span>{/if}
</span>

<style>
  .pair {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }
  .label {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.4rem;
    height: 1.6rem;
    border-radius: var(--radius-tile);
    background: var(--panel);
    color: var(--ink);
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.78rem;
  }
  .member {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
  }
  .face {
    width: 1.45rem;
    height: 1.45rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .name {
    font-size: 0.74rem;
    overflow-wrap: anywhere;
  }
  .self {
    flex: none;
    font-size: 0.63rem;
  }
</style>
