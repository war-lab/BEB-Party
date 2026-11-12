<!--
  開示（基本設計/15のステージと画面）。

  入ったら全員の画面で 3、2、1 のカウントダウンを出し、1 の後に全チームの語を出す。
  カウントダウンは声を合わせる目安であり、遷移も締切の判定も行わない（基本設計/02の禁止事項）。
  一致したチームには記号と「一致」の文字を添え、色だけに頼らない。
  近い語のチームには申告のボタンを、申告があったチームの行には異議のボタンと異議を出した人のアイコンを出す。
  黄の輪郭は「いまやること」の案内だけに使い、一致したチームと自分が異議を出した申告は背景の膜で示す。
-->
<script lang="ts">
  import { faceColor, playerIconOf, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    STAGES,
    isClaimAccepted,
    isFinalRound,
    type MindMeldPublic,
    type TeamAttempt,
    type TeamPublic,
  } from "@beb/shared-mindmeld";
  import ClaimRule from "./ClaimRule.svelte";
  import KeyExpressions from "./KeyExpressions.svelte";
  import TeamChip from "./TeamChip.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: MindMeldPublic;
  }
  let { room, publicState }: Props = $props();

  const COUNT_STEP_MS = 700;

  const myId = $derived(ui.myPlayerId);
  const myLevel = $derived(room.players.find((player) => player.id === myId)?.level ?? 1);
  const myTeam = $derived(publicState.teams.find((team) => myId !== null && team.memberIds.includes(myId)));
  const isReady = $derived(myId !== null && publicState.readyPlayerIds.includes(myId));
  const connectedIds = $derived(room.players.filter((player) => player.connected).map((player) => player.id));
  const attempt = $derived(publicState.attempts[publicState.attempts.length - 1]);
  const attemptKey = $derived(`${publicState.roundIndex}:${publicState.attemptIndex}`);
  const label = $derived(
    `${stageLabels[STAGES.reveal]} お題${publicState.roundIndex + 1}/${publicState.maxRounds}・${publicState.attemptIndex + 1}回目`,
  );

  // カウントダウン。試行ごとに 3 → 2 → 1 → 開示 と進める
  // attemptKey は文字列の派生値であり、同じ試行の中の state の受信では作り直されない
  let count = $state(3);
  $effect(() => {
    void attemptKey;
    count = 3;
    const timer = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(timer);
      }
    }, COUNT_STEP_MS);
    return () => clearInterval(timer);
  });
  const revealed = $derived(count <= 0);

  function teamOf(teamId: string): TeamPublic | undefined {
    return publicState.teams.find((team) => team.id === teamId);
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function pointsOf(teamId: string): number {
    return publicState.scores.find((score) => score.teamId === teamId)?.points ?? 0;
  }

  /** 申告がこのまま締切を迎えたら認められるか。サーバの判定と同じ関数で数える */
  function wouldAccept(entry: TeamAttempt): boolean {
    const members = teamOf(entry.teamId)?.memberIds ?? [];
    const judges = connectedIds.filter((playerId) => !members.includes(playerId));
    const objectors = (entry.claim?.objectorIds ?? []).filter((playerId) => judges.includes(playerId));
    return isClaimAccepted(objectors.length, judges.length);
  }

  function claim(): void {
    sendAction(ACTIONS.claim, { roundIndex: publicState.roundIndex, attemptIndex: publicState.attemptIndex });
  }

  function object(teamId: string, objecting: boolean): void {
    sendAction(ACTIONS.object, {
      roundIndex: publicState.roundIndex,
      attemptIndex: publicState.attemptIndex,
      teamId,
      objecting,
    });
  }
</script>

<main class="reveal">
  <StageTimer deadline={room.deadline} {label} />

  <div class="body">
    {#if isFinalRound(publicState)}<p class="final" data-testid="final-round">最後のお題</p>{/if}

    {#if publicState.prompt}
      <p class="prompt" data-testid="prompt-en">{publicState.prompt.en}</p>
    {/if}

    {#if !revealed}
      <div class="countdown" data-testid="countdown" aria-live="assertive">
        {#key count}<span class="num beb-pop">{count}</span>{/key}
        <p class="call">Three, two, one! — 1 に合わせて自分の語を声に出す</p>
      </div>
    {:else}
      <p class="guide" data-testid="stage-guide">
        そろわなかったチームは、なぜその語にしたかを英語で言い合ってみてください。近い語なら「同じ語」と申告できます。
      </p>

      <ul class="teams" data-testid="reveal-list">
        {#each attempt?.teams ?? [] as entry (entry.teamId)}
          {@const team = teamOf(entry.teamId)}
          {@const isMine = myTeam?.id === entry.teamId}
          {@const iObject = myId !== null && (entry.claim?.objectorIds.includes(myId) ?? false)}
          <li
            class="row"
            class:matched={entry.exact}
            class:objected={iObject}
            data-testid="reveal-row"
            data-team-id={entry.teamId}
            data-exact={entry.exact}
          >
            <div class="head">
              {#if team}<TeamChip {team} {nameOf} />{/if}
              {#if isMine}<span class="beb-pill self">あなた</span>{/if}
              {#if entry.exact}
                <span class="verdict" data-testid="matched">✓ 一致</span>
              {:else if entry.claim}
                <span class="verdict claimed" data-testid="claimed">≈ 申告中</span>
              {:else}
                <span class="verdict miss">× ちがう</span>
              {/if}
            </div>
            <div class="words">
              {#each entry.words as word, index (word.playerId)}
                {#if index > 0}<span class="vs" aria-hidden="true">/</span>{/if}
                <span class="word" data-testid="revealed-word" class:none={word.word === null}>
                  <span class="by">{nameOf(word.playerId)}</span>
                  <span class="text">{word.word ?? "（出さなかった）"}</span>
                </span>
              {/each}
            </div>

            {#if entry.near && entry.claim === null && isMine}
              <button class="beb-btn blue small" data-testid="claim" onclick={claim}><span>同じ語と申告する</span></button>
            {:else if entry.near && entry.claim === null}
              <p class="note">近い語です。このチームは申告できます。</p>
            {/if}

            {#if entry.claim}
              <div class="claim" data-testid="claim-box">
                <p class="note">
                  {nameOf(entry.claim.claimedBy)} が「同じ語」と申告。
                  <span data-testid="claim-forecast">{wouldAccept(entry) ? "このままなら認められる" : "このままなら退けられる"}</span>
                </p>
                <div class="objectors" data-testid="objectors">
                  <span class="caption">異議</span>
                  {#each entry.claim.objectorIds as objectorId (objectorId)}
                    <span class="face" style={`background:${faceColor(objectorId)}`} role="img" aria-label={nameOf(objectorId)}>
                      <span aria-hidden="true">{playerIconOf(objectorId)}</span>
                    </span>
                  {:else}
                    <span class="caption">なし</span>
                  {/each}
                </div>
                {#if !isMine && myId !== null}
                  <button
                    class="beb-btn small"
                    class:ghost={iObject}
                    class:red={!iObject}
                    data-testid="object"
                    onclick={() => object(entry.teamId, !iObject)}
                  >
                    <span>{iObject ? "異議を取り下げる" : "別の語だと思う（異議）"}</span>
                  </button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>

      <ClaimRule />
    {/if}

    <section class="scores" data-testid="scores">
      <h2>合計点</h2>
      <ul>
        {#each publicState.teams as team (team.id)}
          <li>
            <TeamChip {team} {nameOf} />
            <span class="points" data-testid="team-points" data-team-id={team.id}>{pointsOf(team.id)}点</span>
          </li>
        {/each}
      </ul>
    </section>

    <KeyExpressions expressions={publicState.keyExpressions} {myLevel} />

    <button class="beb-btn yellow" data-testid="ready" disabled={isReady} onclick={() => sendAction(ACTIONS.ready)}>
      <span>{isReady ? "次を待っています" : "次へ"}</span>
    </button>
    <p class="waiting" data-testid="ready-count">じゅんび {publicState.readyPlayerIds.length} / {connectedIds.length}</p>
  </div>
</main>

<style>
  .reveal {
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
  .prompt {
    margin: 0 0 0.7rem;
    text-align: center;
    font-size: 1rem;
    font-weight: 700;
    color: var(--mist);
  }
  .countdown {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    margin: 1.2rem 0;
  }
  .num {
    display: inline-block;
    font-family: var(--font-display);
    font-size: 5rem;
    line-height: 1;
    color: var(--yellow);
  }
  .call {
    margin: 0;
    font-size: 0.82rem;
    color: var(--mist);
    text-align: center;
  }
  .guide {
    margin: 0 0 0.7rem;
    background: var(--ground-2);
    border: var(--outline-width) solid var(--yellow);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--mist);
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
  .teams {
    list-style: none;
    margin: 0 0 0.9rem;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .row {
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.6rem;
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }
  .row.matched,
  .row.objected {
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--ground-2);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .verdict {
    margin-left: auto;
    font-size: 0.8rem;
    font-weight: 700;
    border-radius: var(--radius-tile);
    padding: 0.1rem 0.5rem;
    background: var(--yellow);
    color: var(--ink);
  }
  .verdict.claimed {
    background: var(--panel);
  }
  .verdict.miss {
    background: transparent;
    color: var(--mist);
  }
  .words {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  .word {
    display: grid;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.2rem 0.6rem;
    min-width: 0;
  }
  .word .by {
    font-size: 0.66rem;
    color: var(--ink-soft);
  }
  .word .text {
    font-size: 1.25rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .word.none .text {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .vs {
    color: var(--mist);
  }
  .note {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--mist);
  }
  .claim {
    display: grid;
    gap: 0.35rem;
  }
  .objectors {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }
  .caption {
    font-size: 0.72rem;
    color: var(--mist);
  }
  .face {
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .scores ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .scores li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.3rem 0.55rem;
  }
  .points {
    flex: none;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .waiting {
    margin: 0.6rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
