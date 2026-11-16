<!--
  次の説明役のペアを発表する（16の画面）。

  説明役のペアの端末にはお題のカットインと開始ボタンを、ほかの端末には説明役のペア・話す順・得点を出す。
  30秒の締切は数字で見せない。急かすとお題を読み終える前に開始を押す（DON'T SAY ITの交代と同じ）。
  締切そのものはサーバが持ち、到達すれば自動で explaining へ進む。
-->
<script lang="ts">
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    STAGES,
    explainerTeamIdOf,
    isExplainer,
    teamOf,
    type ExplainerSecret,
    type TwoHeadedPublic,
    type TwoHeadedSecret,
  } from "@beb/shared-twoheaded";
  import ExplainerCutIn from "./ExplainerCutIn.svelte";
  import PairChip from "./PairChip.svelte";
  import PairScores from "./PairScores.svelte";
  import SpeakingOrder from "./SpeakingOrder.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: TwoHeadedPublic;
    secret: TwoHeadedSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const explainerTeamId = $derived(explainerTeamIdOf(publicState));
  const explainerTeam = $derived(teamOf(publicState.teams, explainerTeamId));
  // 役は公開状態と秘密の両方が一致したときだけ認める。遷移の直後は前の手番の秘密を一度持つことがある
  const explainerSecret = $derived(
    isExplainer(publicState, ui.myPlayerId) && secret?.role === "explainer" ? (secret as ExplainerSecret) : null,
  );
  const turnLabel = $derived(`${publicState.turnIndex + 1} / ${publicState.turnOrder.length}`);

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function startTurn(): void {
    sendAction(ACTIONS.startTurn);
  }
</script>

<main class="handoff">
  <StageTimer deadline={undefined} label={`${stageLabels[STAGES.handoff]} ${turnLabel}`} />

  <div class="body">
    <p class="guide" data-testid="stage-guide">
      <span class="tag">いまやること</span>
      <span>
        {explainerSecret
          ? "あなたのペアの番です。お題を開いて2人で読み、話す順を確かめたら「はじめる」を押してください。"
          : "次の説明役のペアを待ってください。始まったら声を聞いて、分かったら英語で答えます。"}
      </span>
    </p>

    <h1 class="title">つぎの説明役</h1>
    {#if explainerTeam}
      <div class="tile" data-testid="next-explainers" data-team-id={explainerTeam.teamId}>
        <PairChip team={explainerTeam} teams={publicState.teams} {nameOf} withNames />
      </div>
    {/if}

    <SpeakingOrder order={publicState.speakingOrder} {nameOf} />

    <h2>得点</h2>
    <PairScores teams={publicState.teams} scores={publicState.scores} {nameOf} {explainerTeamId} />
  </div>
</main>

{#if explainerSecret}
  <ExplainerCutIn secret={explainerSecret} speakingOrder={publicState.speakingOrder} {nameOf} onStart={startTurn} />
{/if}

<style>
  .handoff {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
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
  .guide {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: rgba(255, 255, 255, 0.1);
    border: var(--outline-width) solid var(--yellow);
    border-radius: var(--radius-tile);
    margin: 0 0 0.8rem;
    padding: 0.5rem 0.7rem;
    font-size: 0.82rem;
    line-height: 1.6;
  }
  .tag {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
  }
  .title {
    font-family: var(--font-display);
    font-size: 1.5rem;
    margin: 0.2rem 0 0.6rem;
    transform: skew(var(--skew-angle));
    transform-origin: left bottom;
    text-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
  }
  .tile {
    background: var(--ground-2);
    border: 4px solid var(--red);
    border-radius: var(--radius-card);
    padding: 0.8rem;
    margin: 0 0 0.8rem;
    box-shadow: var(--shadow-tile);
  }
  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
    margin: 0.6rem 0 0.35rem;
  }
</style>
