<!--
  開示（基本設計/11のステージ）。

  そのラウンドの提出を作者付きで並べ、得点表を出す（ビジュアルデザイン.mdの演出プリミティブ）。

  最終ラウンドではサーバが result を返して部屋が finished になる。
  そのときだけ得点表の1位を大きく出し、ロビーへ戻る導線を置く。
-->
<script lang="ts">
  import { faceColor, playerIconOf, sendAction, sendCommon, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    STAGES,
    type RoundRecord,
    type WhoWroteThisPublic,
    type WhoWroteThisResult,
  } from "@beb/shared-whowrotethis";
  import ScoreBoard from "./ScoreBoard.svelte";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: WhoWroteThisPublic;
    result: WhoWroteThisResult | null;
    onLeave: () => void;
  }
  let { room, publicState, result, onLeave }: Props = $props();

  const isFinished = $derived(room.lifecycle === "finished" && result !== null);
  const rounds = $derived<RoundRecord[]>(result?.rounds ?? publicState.rounds);
  // 最終ラウンドは全ラウンドを振り返り、途中のラウンドは直前の1ラウンドだけを出す
  const shown = $derived(isFinished ? rounds : rounds.slice(-1));
  const scores = $derived(result?.scores ?? publicState.scores);
  const roundLabel = $derived(
    `${Math.min(publicState.roundIndex + 1, publicState.totalRounds)} / ${publicState.totalRounds}`,
  );
  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function hitCount(record: RoundRecord, index: number): number {
    const item = record.items[index];
    return item === undefined ? 0 : item.guesses.filter((guess) => guess.targetPlayerId === item.authorId).length;
  }

  function next(): void {
    sendAction(ACTIONS.ready);
  }

  function backToLobby(): void {
    sendCommon({ type: "nextGame" });
    onLeave();
  }
</script>

<main class="reveal beb-stage-radial">
  <StageTimer
    deadline={isFinished ? undefined : room.deadline}
    label={`${stageLabels[STAGES.reveal]} ${roundLabel}`}
  />

  <div class="body">
    <StageGuide step="reveal" isFinal={isFinished} />

    <section class="scores">
      <h2>{isFinished ? "最終得点" : "ここまでの得点"}</h2>
      <ScoreBoard {room} {scores} highlightTop={isFinished} />
    </section>

    {#each shown as record (record.questionId)}
      <section class="round" data-testid="round-record">
        <p class="q-en">{record.question.en}</p>
        <p class="q-ja">{record.question.ja}</p>
        <ul class="items">
          {#each record.items as item, index (item.index)}
            <li class="beb-zoom-in" style={`animation-delay:${index * 60}ms`}>
              <p class="text">{item.text}</p>
              <p class="meta">
                <span class="face" style={`background:${faceColor(item.authorId)}`}>
                  <span aria-hidden="true">{playerIconOf(item.authorId)}</span>
                </span>
                <span class="name">{nameOf(item.authorId)}</span>
                <span class="hits">あてた人 {hitCount(record, index)} / {item.guesses.length}</span>
              </p>
            </li>
          {/each}
        </ul>
        {#if record.items.length === 0}
          <p class="empty">このラウンドは提出がありませんでした。</p>
        {/if}
      </section>
    {/each}

    {#if isFinished}
      <button class="beb-btn yellow" onclick={backToLobby} data-testid="back-to-lobby">
        <span>ロビーへ戻る</span>
      </button>
    {:else}
      <p class="count" data-testid="ready-count">
        つづき {publicState.readyPlayerIds.length} / {room.players.filter((player) => player.connected).length}
      </p>
      <button class="beb-btn yellow" onclick={next} disabled={isReady} data-testid="next-round">
        <span>{isReady ? "待っています…" : "つづき"}</span>
      </button>
    {/if}
  </div>
</main>

<style>
  .reveal {
    min-height: 100vh;
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .scores {
    margin: 0 0 1rem;
  }
  .scores h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .round {
    margin: 0 0 1rem;
  }
  .q-en {
    margin: 0 0 0.15rem;
    font-family: var(--font-display);
    font-size: 1.05rem;
  }
  .q-ja {
    margin: 0 0 0.5rem;
    font-size: 0.74rem;
    color: var(--mist);
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .items li {
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-tile);
    box-shadow: var(--shadow-tile);
    padding: 0.55rem 0.7rem;
  }
  .text {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
    line-height: 1.4;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: 0.76rem;
    color: var(--ink-soft);
  }
  .face {
    display: block;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.3);
    text-align: center;
    line-height: 1.2rem;
  }
  .name {
    font-weight: 700;
    color: var(--ink);
  }
  .hits {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin: 0;
    font-size: 0.8rem;
    color: var(--mist);
  }
  .count {
    margin: 0 0 0.5rem;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
