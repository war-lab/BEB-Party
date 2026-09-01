<!--
  開示（基本設計/10のステージ）。

  確定順位を放射の地にズームインで出し、その下に全員の目標と達成、得点表を並べる
  （ビジュアルデザイン.mdの演出プリミティブ）。

  最終ラウンドではサーバが result を返して部屋が finished になる。
  そのときだけ得点表の1位を大きく出し、ロビーへ戻る導線を置く。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    STAGES,
    type RankingPublic,
    type RankingResult,
    type RoundRecord,
  } from "@beb/shared-ranking";
  import { faceColor, playerIconOf, ScoreBoard, sendAction, sendCommon, StageTimer, ui } from "@beb/client-core";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: RankingPublic;
    result: RankingResult | null;
    /** 部屋から出る。ロビーへ戻す操作とは別である（08・09と同じ扱い） */
    onLeave: () => void;
  }
  let { room, publicState, result, onLeave }: Props = $props();

  const isFinished = $derived(room.lifecycle === "finished" && result !== null);
  const rounds = $derived<RoundRecord[]>(result?.rounds ?? publicState.rounds);
  const latest = $derived(rounds.length > 0 ? rounds[rounds.length - 1] : undefined);
  const scores = $derived(result?.scores ?? publicState.scores);
  const roundLabel = $derived(`${Math.min(publicState.roundIndex + 1, publicState.totalRounds)} / ${publicState.totalRounds}`);
  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));

  function labelOf(record: RoundRecord, itemId: string): string {
    return record.items.find((item) => item.id === itemId)?.en ?? itemId;
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function next(): void {
    sendAction(ACTIONS.ready);
  }

  function backToLobby(): void {
    // nextGameだけを送る。onLeave()（切断とホームへの遷移）を呼ぶと、押した本人が部屋から出る
    sendCommon({ type: "nextGame" });
  }
</script>

<main class="reveal beb-stage-radial">
  <StageTimer deadline={isFinished ? undefined : room.deadline} label={`${stageLabels[STAGES.reveal]} ${roundLabel}`} />

  <div class="body">
    <StageGuide step="reveal" isFinal={isFinished} />

    {#if latest}
      <section class="ranking" data-testid="final-ranking">
        <p class="q-en">{latest.question.en}</p>
        <ol class="rows">
          {#each latest.ranking as itemId, index (itemId)}
            <li class="beb-zoom-in" style={`animation-delay:${index * 60}ms`}>
              <span class="rank">{index + 1}</span>
              <span class="en">{labelOf(latest, itemId)}</span>
            </li>
          {/each}
        </ol>
      </section>

      <section class="goals" data-testid="revealed-goals">
        <h2>みんなの目標</h2>
        <ul>
          {#each latest.goals as entry (entry.playerId)}
            <li class:achieved={entry.achieved}>
              <span class="face" style={`background:${faceColor(entry.playerId)}`}>
                <span aria-hidden="true">{playerIconOf(entry.playerId)}</span>
              </span>
              <span class="text">
                <span class="name">{nameOf(entry.playerId)}</span>
                <span class="ja">{entry.ja}</span>
              </span>
              <span class="mark">{entry.achieved ? "達成" : "未達"}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="scores">
      <h2>{isFinished ? "最終得点" : "ここまでの得点"}</h2>
      <ScoreBoard {room} {scores} highlightTop={isFinished} />
    </section>

    {#if isFinished}
      <button class="beb-btn yellow" onclick={backToLobby} data-testid="back-to-lobby"><span>ロビーへ戻る</span></button>
      <button class="beb-btn ghost leave" onclick={onLeave} data-testid="leave-room"><span>部屋を出る</span></button>
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
  h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .ranking {
    margin: 0 0 1rem;
  }
  .q-en {
    margin: 0 0 0.5rem;
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--yellow);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .rows li {
    display: grid;
    grid-template-columns: 1.8rem 1fr;
    align-items: center;
    gap: 0.6rem;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-tile);
    box-shadow: var(--shadow-tile);
    padding: 0.45rem 0.7rem;
  }
  .rows .rank {
    font-family: var(--font-display);
    font-size: 1.3rem;
    color: var(--red);
    text-align: center;
  }
  .rows .en {
    font-family: var(--font-display);
    font-size: 1.15rem;
  }
  .goals {
    margin: 0 0 1rem;
  }
  .goals ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .goals li {
    display: grid;
    grid-template-columns: 1.5rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.6rem;
  }
  .goals li.achieved {
    border-color: var(--yellow);
  }
  .face {
    display: block;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.3);
  }
  .text {
    display: grid;
    gap: 0.05rem;
  }
  .name {
    font-size: 0.72rem;
    color: var(--mist);
  }
  .ja {
    font-size: 0.86rem;
  }
  .mark {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.68rem;
    color: var(--mist);
  }
  .goals li.achieved .mark {
    color: var(--yellow);
  }
  .scores {
    margin: 0 0 1rem;
  }
  .leave {
    margin-top: 0.5rem;
  }
  .count {
    margin: 0 0 0.4rem;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
