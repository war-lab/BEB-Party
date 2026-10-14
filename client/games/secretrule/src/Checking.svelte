<!--
  報告と回答（基本設計/14の「成否は書いた本人にだけ配る」「回答はラウンドの終わりに判定する」）。

  成否は自分の英文にだけ出る。他人の成否は英語の報告で聞く（ADR-0031）。
  回答はラウンドの終わり（全員の ready か締切）に、選んだ人の選択が揃っていれば確定する。
  揃った瞬間には確定しない。準備完了ボタンの近くに、いまの選択で回答になるかを出す。
-->
<script lang="ts">
  import { acquireWakeLock, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    STAGES,
    agreedCandidateOf,
    isFinalRound,
    type SecretRulePublic,
    type SecretRuleSecret,
  } from "@beb/shared-secretrule";
  import CandidateList from "./CandidateList.svelte";
  import History from "./History.svelte";
  import KeyExpressions from "./KeyExpressions.svelte";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: SecretRulePublic;
    secret: SecretRuleSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  $effect(() => acquireWakeLock());

  const myLevel = $derived(room.players.find((player) => player.id === ui.myPlayerId)?.level ?? 1);
  const connectedIds = $derived(room.players.filter((player) => player.connected).map((player) => player.id));
  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  const mySelection = $derived(
    publicState.selections.find((entry) => entry.playerId === ui.myPlayerId)?.candidateId ?? null,
  );
  const eliminatedIds = $derived(
    publicState.answers.filter((answer) => !answer.correct).map((answer) => answer.candidateId),
  );
  const isTested = $derived(
    publicState.entries.some(
      (entry) => entry.roundIndex === publicState.roundIndex && entry.playerId === ui.myPlayerId,
    ),
  );
  const lastAnswer = $derived(publicState.answers.at(-1));
  const justMissed = $derived(
    lastAnswer !== undefined && !lastAnswer.correct && lastAnswer.roundIndex === publicState.roundIndex - 1,
  );
  // 画面の表示とサーバの判定が同じ関数を使う
  const agreed = $derived(agreedCandidateOf(publicState.selections, connectedIds));
  const agreedNumber = $derived(
    agreed === null ? null : publicState.candidates.findIndex((entry) => entry.id === agreed) + 1,
  );
  const answerStatus = $derived.by(() => {
    if (publicState.selections.length === 0) {
      return "まだ誰も選んでいません。このまま進むと、このラウンドは回答しません。";
    }
    if (agreedNumber === null) {
      return "選択が割れています。このまま進むと、このラウンドは回答しません。";
    }
    return `${agreedNumber}番で揃っています。全員が進むと、${agreedNumber}番を答えにします。`;
  });

  function select(candidateId: string | null): void {
    sendAction(ACTIONS.select, { roundIndex: publicState.roundIndex, candidateId });
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="checking">
  <StageTimer
    deadline={room.deadline}
    label={`${stageLabels[STAGES.checking]} ${publicState.roundIndex + 1} / ${publicState.maxRounds}`}
  />

  <div class="body">
    <StageGuide step="checking" {isTested} />
    {#if isFinalRound(publicState)}<p class="final" data-testid="final-round">最後のラウンド</p>{/if}
    {#if justMissed && lastAnswer}
      <p class="missed" data-testid="last-answer-wrong">
        前のラウンドの答え（{publicState.candidates.findIndex((entry) => entry.id === lastAnswer.candidateId) + 1}番）は違いました。
      </p>
    {/if}

    <History
      entries={publicState.entries}
      results={secret?.results ?? []}
      myPlayerId={ui.myPlayerId}
      {nameOf}
      onlyRound={publicState.roundIndex}
      title="今回試した英文"
    />
    {#if publicState.entries.every((entry) => entry.roundIndex !== publicState.roundIndex)}
      <p class="none">今回は試した英文がありません。</p>
    {/if}

    <KeyExpressions expressions={publicState.keyExpressions} {myLevel} />

    <CandidateList
      candidates={publicState.candidates}
      {myLevel}
      selections={publicState.selections}
      {eliminatedIds}
      selectable
      {mySelection}
      onSelect={select}
    />

    <p class="status" class:agreed={agreedNumber !== null} data-testid="answer-status">{answerStatus}</p>
    <button class="beb-btn yellow" data-testid="ready" disabled={isReady} onclick={() => sendAction(ACTIONS.ready)}>
      <span>{isReady ? "待っています" : "この選択で進む"}</span>
    </button>
    <p class="waiting" data-testid="ready-count">
      すすむ {publicState.readyPlayerIds.length} / {connectedIds.length}
    </p>

    <History
      entries={publicState.entries.filter((entry) => entry.roundIndex !== publicState.roundIndex)}
      results={secret?.results ?? []}
      myPlayerId={ui.myPlayerId}
      {nameOf}
      title="前のラウンドまでに試した英文"
    />
  </div>
</main>

<style>
  .checking {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .final {
    margin: 0 0 0.6rem;
    text-align: center;
    font-family: var(--font-display);
    color: var(--yellow);
  }
  .missed {
    margin: 0 0 0.7rem;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.45rem 0.7rem;
    font-size: 0.82rem;
    font-weight: 700;
  }
  .none {
    margin: 0 0 0.8rem;
    font-size: 0.82rem;
    color: var(--mist);
  }
  .status {
    margin: 0 0 0.5rem;
    background: var(--ground-2);
    border: var(--outline-width) solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-tile);
    padding: 0.45rem 0.7rem;
    font-size: 0.8rem;
    color: var(--mist);
  }
  .status.agreed {
    border-color: var(--yellow);
    color: var(--panel);
    font-weight: 700;
  }
  .waiting {
    margin: 0.6rem 0 1rem;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
