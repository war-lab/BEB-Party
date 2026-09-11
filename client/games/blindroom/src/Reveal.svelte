<!--
  答え合わせ（基本設計/12のステージ）。

  見本と全員の盤面を並べ、一致したマスに印を付ける。得点はサーバが確定した値をそのまま出す。

  最終ラウンドではサーバが result を返して部屋が finished になる。
  そのときだけ得点表の1位を大きく出し、ホストにロビーへ戻る導線を置く。
  戻す操作は nextGame の送信だけとする。切断はしない（部屋に残ったまま次のゲームを選ぶ）。
-->
<script lang="ts">
  import { faceColor, playerIconOf, ScoreBoard, sendAction, sendCommon, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    PLACE_COUNT,
    STAGES,
    type BlindRoomPublic,
    type BlindRoomResult,
    type PaletteItem,
    type RoundRecord,
  } from "@beb/shared-blindroom";
  import BoardGrid from "./BoardGrid.svelte";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: BlindRoomPublic;
    result: BlindRoomResult | null;
    /** 部屋から出る。ロビーへ戻す操作とは別である（08〜11と同じ扱い） */
    onLeave: () => void;
  }
  let { room, publicState, result, onLeave }: Props = $props();

  const isFinished = $derived(room.lifecycle === "finished" && result !== null);
  const rounds = $derived<RoundRecord[]>(isFinished ? (result?.rounds ?? publicState.rounds) : publicState.rounds);
  const latest = $derived<RoundRecord | undefined>(rounds[rounds.length - 1]);
  const scores = $derived(isFinished ? (result?.scores ?? publicState.scores) : publicState.scores);
  // 過去のラウンドは別のアイテムセットを使う。結果に添えられた一覧から引く（12の結果）
  const palette = $derived<PaletteItem[]>(isFinished ? (result?.items ?? publicState.palette) : publicState.palette);
  const roundLabel = $derived(
    `${Math.min(publicState.roundIndex + 1, publicState.totalRounds)} / ${publicState.totalRounds}`,
  );
  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  const isHost = $derived(room.players.some((player) => player.id === ui.myPlayerId && player.isHost));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="reveal beb-stage-radial">
  <StageTimer
    deadline={isFinished ? undefined : room.deadline}
    label={`${stageLabels[STAGES.reveal]} ${roundLabel}`}
  />

  <div class="body">
    <StageGuide step="reveal" isFinal={isFinished} />

    {#if latest}
      <section class="round" data-testid="round-record">
        <h2>見本（説明者 {nameOf(latest.describerId)} ／ {latest.describerPoints}点）</h2>
        <BoardGrid cells={latest.sample} palette={palette} testId="sample-board" />

        <ul class="boards">
          {#each latest.boards as board, index (board.playerId)}
            <li class="beb-zoom-in" style={`animation-delay:${index * 60}ms`} data-testid="listener-board">
              <div class="who">
                <span class="face" style={`background:${faceColor(board.playerId)}`}>
                  <span aria-hidden="true">{playerIconOf(board.playerId)}</span>
                </span>
                <span class="name">{nameOf(board.playerId)}</span>
                <span class="matched">{board.matched} / {PLACE_COUNT}</span>
              </div>
              <BoardGrid cells={board.cells} palette={palette} sample={latest.sample} size="small" />
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
      {#if rounds.length > 1}
        <section class="history">
          <h2>ラウンドの記録</h2>
          <ul>
            {#each rounds as record (record.roundIndex)}
              <li>
                <span class="name">{nameOf(record.describerId)}</span>
                <span class="detail">
                  説明者 {record.describerPoints}点 ／ 合計 {record.boards.reduce(
                    (sum, board) => sum + board.matched,
                    0,
                  )}マス
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if isHost}
        <button class="beb-btn yellow" onclick={() => sendCommon({ type: "nextGame" })} data-testid="back-to-lobby">
          <span>ロビーへ戻る</span>
        </button>
      {:else}
        <p class="count" data-testid="waiting-host">ホストがロビーへ戻します。</p>
      {/if}
      <button class="beb-btn ghost leave" onclick={onLeave} data-testid="leave-room"><span>部屋を出る</span></button>
    {:else}
      <p class="count" data-testid="ready-count">
        つづき {publicState.readyPlayerIds.length} / {room.players.filter((player) => player.connected).length}
      </p>
      <button
        class="beb-btn yellow"
        onclick={() => sendAction(ACTIONS.ready)}
        disabled={isReady}
        data-testid="next-round"
      >
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
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .round,
  .scores,
  .history {
    margin: 0 0 1rem;
  }
  .boards {
    list-style: none;
    margin: 0.7rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .boards li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: var(--ground-2);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.5rem;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
    font-size: 0.8rem;
  }
  .face {
    --face-size: 1.4rem;
    border: 2px solid rgba(0, 0, 0, 0.3);
  }
  .name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .matched {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    color: var(--yellow);
  }
  .history ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .history li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.8rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    padding-bottom: 0.2rem;
  }
  .history .detail {
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
  .leave {
    margin-top: 0.5rem;
  }
  .count {
    margin: 0 0 0.5rem;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
