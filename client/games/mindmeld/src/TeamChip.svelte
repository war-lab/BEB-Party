<!--
  チームの見出し。ラベル（A〜D）とメンバーの顔アイコンで示す。
  参加者の顔色は8色をハッシュで割り当てるため、チームの色としては使わない（15の画面、ADR-0033）。
  アイコンには名前の読み上げを付ける。
-->
<script lang="ts">
  import { faceColor, playerIconOf } from "@beb/client-core";
  import type { TeamPublic } from "@beb/shared-mindmeld";

  interface Props {
    team: TeamPublic;
    nameOf: (playerId: string) => string;
    /** 名前も並べるか。狭い行ではアイコンだけにする */
    withNames?: boolean;
    /** 薄く出すメンバー（この試行で語を出さない人） */
    restingIds?: string[];
  }
  let { team, nameOf, withNames = false, restingIds = [] }: Props = $props();
</script>

<span class="team" data-testid="team-chip" data-team-id={team.id}>
  <span class="label" aria-label={`チーム${team.label}`}>{team.label}</span>
  {#each team.memberIds as memberId (memberId)}
    <span class="member" class:resting={restingIds.includes(memberId)}>
      <span class="face" style={`background:${faceColor(memberId)}`} role="img" aria-label={nameOf(memberId)}>
        <span aria-hidden="true">{playerIconOf(memberId)}</span>
      </span>
      {#if withNames}<span class="name">{nameOf(memberId)}</span>{/if}
    </span>
  {/each}
</span>

<style>
  .team {
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
    width: 1.6rem;
    height: 1.6rem;
    border-radius: var(--radius-tile);
    background: var(--panel);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 0.9rem;
  }
  .member {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    min-width: 0;
  }
  .member.resting {
    opacity: 0.5;
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
</style>
