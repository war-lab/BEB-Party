<!--
  試す英文を選ぶ（基本設計/14の「判定にかける2件の決め方」）。

  全員の下書きを作者つきで出し、各自が試したい下書きに印を付ける（1人2件まで、自分の下書きにも付けられる）。
  印の多い順に2件、同数は当番順で決まる。集計はサーバだけが行い、画面は印を見せるだけである。
-->
<script lang="ts">
  import { acquireWakeLock, faceColor, playerIconOf, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    MARKS_PER_PLAYER,
    STAGES,
    TESTS_PER_ROUND,
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
  const serverMarks = $derived(
    publicState.marks.find((mark) => mark.playerId === ui.myPlayerId)?.draftPlayerIds ?? [],
  );
  // 送信してサーバの状態が返るまでの自分の印。mark は置き換え方式のため、返る前に続けて押すと
  // 古い印を元に配列を作り、先に付けた印が消える。送った印を手元に持ち、次の送信はこれを元に作る
  let pendingMarks = $state<string[] | null>(null);
  const myMarks = $derived(pendingMarks ?? serverMarks);
  $effect(() => {
    const pending = pendingMarks;
    if (pending !== null && sameMembers(pending, serverMarks)) {
      pendingMarks = null;
    }
  });

  function sameMembers(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id) => b.includes(id));
  }
  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
  const eliminatedIds = $derived(
    publicState.answers.filter((answer) => !answer.correct).map((answer) => answer.candidateId),
  );

  function markersOf(draftPlayerId: string): string[] {
    return publicState.marks.filter((mark) => mark.draftPlayerIds.includes(draftPlayerId)).map((mark) => mark.playerId);
  }

  function toggle(draftPlayerId: string): void {
    const next = myMarks.includes(draftPlayerId)
      ? myMarks.filter((id) => id !== draftPlayerId)
      : [...myMarks, draftPlayerId].slice(-MARKS_PER_PLAYER);
    // 未接続で送れなかったときは手元の印を持たない。サーバの印と画面が食い違わないようにする
    pendingMarks = sendAction(ACTIONS.mark, { roundIndex: publicState.roundIndex, draftPlayerIds: next }) ? next : null;
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="choosing">
  <StageTimer
    deadline={room.deadline}
    label={`${stageLabels[STAGES.choosing]} ${publicState.roundIndex + 1} / ${publicState.maxRounds}`}
  />

  <div class="body">
    <StageGuide step="choosing" />
    {#if isFinalRound(publicState)}<p class="final">最後のラウンド</p>{/if}

    <section class="drafts">
      <h2>下書き（試すのは{TESTS_PER_ROUND}つ）</h2>
      <ul>
        {#each publicState.drafts as draft (draft.playerId)}
          <li class:marked={myMarks.includes(draft.playerId)} data-testid="draft" data-player-id={draft.playerId}>
            <span class="who">
              <span class="face" style={`background:${faceColor(draft.playerId)}`}>
                <span aria-hidden="true">{playerIconOf(draft.playerId)}</span>
              </span>
              <span>{nameOf(draft.playerId)}</span>
              {#if draft.playerId === ui.myPlayerId}<span class="beb-pill self">あなた</span>{/if}
            </span>
            <span class="text">{draft.text}</span>
            <span class="markers">
              {#each markersOf(draft.playerId) as playerId (playerId)}
                <span class="face small" role="img" aria-label={nameOf(playerId)} title={nameOf(playerId)} style={`background:${faceColor(playerId)}`}>
                  <span aria-hidden="true">{playerIconOf(playerId)}</span>
                </span>
              {/each}
            </span>
            <button class="mark" class:on={myMarks.includes(draft.playerId)} onclick={() => toggle(draft.playerId)} data-testid="mark-draft">
              {myMarks.includes(draft.playerId) ? "印を外す" : "これを試す"}
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <button class="beb-btn yellow" data-testid="ready" disabled={isReady} onclick={() => sendAction(ACTIONS.ready)}>
      <span>{isReady ? "待っています" : "この印で決める"}</span>
    </button>
    <p class="waiting" data-testid="ready-count">けってい {publicState.readyPlayerIds.length} / {connectedCount}</p>

    <KeyExpressions expressions={publicState.keyExpressions} {myLevel} />
    <CandidateList candidates={publicState.candidates} {myLevel} {eliminatedIds} />
    <History entries={publicState.entries} results={secret?.results ?? []} myPlayerId={ui.myPlayerId} {nameOf} />
  </div>
</main>

<style>
  .choosing {
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
  .drafts {
    margin: 0 0 0.8rem;
  }
  h2 {
    margin: 0 0 0.35rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem 0.5rem;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid transparent;
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.6rem;
  }
  /* 黄の輪郭は「いまやること」の案内だけに使う（ビジュアルデザイン.md）。印は背景の膜で示す */
  li.marked {
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--panel);
  }
  .who {
    grid-column: 1 / 3;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: var(--ink-soft);
  }
  .face {
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
  }
  .face.small {
    width: 1.15rem;
    height: 1.15rem;
    font-size: 0.68rem;
  }
  .text {
    grid-column: 1 / 3;
    font-size: 1rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .markers {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    align-items: center;
  }
  .mark {
    background: var(--ground-2);
    color: var(--panel);
    border: 2px solid var(--ground-2);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.6rem;
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .mark.on {
    background: var(--yellow);
    color: var(--ink);
    border-color: var(--yellow);
  }
  .waiting {
    margin: 0.6rem 0 1rem;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
