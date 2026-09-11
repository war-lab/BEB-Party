<!--
  配置（基本設計/12のステージ）。

  説明者は見本と言い方の例を見ながら英語で伝える。聞き手はパレットとマスをタップして同じ並びを作る。
  盤面はサーバが持ち、クライアントは操作を送るだけとする。送信は間引く（place-sender.ts）。
-->
<script lang="ts">
  import { acquireWakeLock, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    HINT_BLANK,
    PLACE_COUNT,
    STAGES,
    boardSizeOf,
    cellCountOf,
    columnOrdinalsEn,
    describerPlayerIdOf,
    emptyBoard,
    iconUrl,
    placedCount,
    rowWordsEn,
    type BlindRoomPublic,
    type BlindRoomSecret,
    type Board,
    type DescriberSecret,
    type ListenerSecret,
  } from "@beb/shared-blindroom";
  import BoardGrid from "./BoardGrid.svelte";
  import StageGuide from "./StageGuide.svelte";
  import { createDoneSender } from "./done-sender";
  import { createPlaceSender } from "./place-sender";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: BlindRoomPublic;
    secret: BlindRoomSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const describerId = $derived(describerPlayerIdOf(publicState));
  const isDescriber = $derived(ui.myPlayerId !== null && ui.myPlayerId === describerId);
  const describerSecret = $derived<DescriberSecret | null>(
    secret?.role === "describer" && secret.roundIndex === publicState.roundIndex ? secret : null,
  );
  const listenerSecret = $derived<ListenerSecret | null>(
    secret?.role === "listener" && secret.roundIndex === publicState.roundIndex ? secret : null,
  );
  const roundLabel = $derived(`${publicState.roundIndex + 1} / ${publicState.totalRounds}`);
  const isDone = $derived(ui.myPlayerId !== null && publicState.donePlayerIds.includes(ui.myPlayerId));
  const listenerCount = $derived(
    room.players.filter((player) => player.connected && player.id !== describerId).length,
  );

  const cellCount = $derived(cellCountOf(publicState.boardSizeId));
  const boardSize = $derived(boardSizeOf(publicState.boardSizeId));
  // 埋める語は広さで変わる。4列に「真ん中」は無く、4段に「middle」は無い
  const rowWords = $derived(rowWordsEn(boardSize.rows).join("・"));
  const columnWords = $derived(columnOrdinalsEn(boardSize.columns).join("・"));

  const sender = createPlaceSender();
  const doneSender = createDoneSender(sender);

  let cells = $state<Board>([]);
  let selectedId = $state<string | null>(null);
  let blocked = $state(false);
  let initializedRound = -1;
  let wasConnected = true;

  // サーバが持つ自分の盤面で初期化する。再接続でも同じ経路で復元される（12の秘密情報）
  $effect(() => {
    const round = publicState.roundIndex;
    const board = listenerSecret?.board;
    if (board !== undefined && initializedRound !== round) {
      initializedRound = round;
      cells = [...board];
    }
  });

  // 秘密が届く前でも盤面を描けるようにする
  $effect(() => {
    if (cells.length !== cellCount) {
      cells = emptyBoard(cellCount);
      initializedRound = -1;
    }
  });

  $effect(() => acquireWakeLock());
  $effect(() => () => sender.dispose());

  const remaining = $derived(PLACE_COUNT - placedCount(cells));

  function apply(next: Board): void {
    cells = next;
    selectedId = null;
    sender.send(next);
  }

  /** 完了申告。盤面と申告の順序は done-sender.ts が持つ */
  function toggleDone(): void {
    doneSender.declare(publicState.roundIndex, !isDone);
  }

  /**
   * 再接続したら、届かなかった申告を送り直す。
   *
   * `sendAction` は未接続のとき送らずに戻る（[基本設計/02](../../../docs/基本設計/02_クライアント.md)）。
   * 押した瞬間に接続が切れていると申告が消え、締切まで場が止まる（E2Eで実際に踏んだ）。
   * 送るのは「接続が戻った瞬間」に限る。状態が届くたびに送ると、サーバが拒否し続ける場合に
   * 流量制限（[ADR-0017](../../../docs/adr/0017-メッセージ流量の制限はインメモリで持つ.md)）へ触れる。
   */
  $effect(() => {
    const connected = ui.connectionStatus === "connected";
    const recovered = connected && !wasConnected;
    wasConnected = connected;
    if (recovered) {
      doneSender.resend(publicState.roundIndex, isDone);
    }
  });

  function tapPalette(id: string): void {
    blocked = false;
    selectedId = selectedId === id ? null : id;
  }

  function tapCell(index: number): void {
    blocked = false;
    const target = selectedId;
    if (target === null) {
      if (cells[index] === null) {
        return;
      }
      const next = [...cells];
      next[index] = null;
      apply(next);
      return;
    }

    // 同じものを2マスに置かない。すでに置いてあれば移動として扱う（サーバのduplicate_itemを踏まない）
    const next: Board = cells.map((cell) => (cell === target ? null : cell));
    next[index] = target;
    if (placedCount(next) > PLACE_COUNT) {
      blocked = true;
      selectedId = null;
      return;
    }
    apply(next);
  }
</script>

<main class="building">
  <StageTimer deadline={room.deadline} label={`${stageLabels[STAGES.building]} ${roundLabel}`} />

  <div class="body">
    <StageGuide step="building" isDescriber={isDescriber} />

    {#if isDescriber}
      <section class="describer">
        <p class="lead">あなたの見本</p>
        <BoardGrid
          cells={describerSecret?.sample ?? emptyBoard(cellCount)}
          palette={publicState.palette}
          boardSizeId={publicState.boardSizeId}
          testId="sample-board"
        />

        {#if describerSecret && describerSecret.hintEn.length > 0}
          <section class="hints" data-testid="my-hints">
            <h2>言い方の例</h2>
            <p class="note">{HINT_BLANK} はものの名前に置き換えてください。段は {rowWords}、横は left・right、細かい位置は {columnWords} from the left です。</p>
            <ul>
              {#each describerSecret.hintEn as hint (hint)}
                <li>{hint}</li>
              {/each}
            </ul>
          </section>
        {/if}

        <p class="count" data-testid="done-count">できた {publicState.donePlayerIds.length} / {listenerCount}</p>
      </section>
    {:else}
      <BoardGrid
        cells={cells}
        palette={publicState.palette}
        boardSizeId={publicState.boardSizeId}
        onCellTap={tapCell}
        testId="my-board"
      />

      <p class="remaining" data-testid="remaining">
        あと {remaining} 個
        {#if blocked}<span class="warn">（{PLACE_COUNT}個までです。どれかを外してください）</span>{/if}
      </p>

      <ul class="palette" data-testid="palette">
        {#each publicState.palette as item (item.id)}
          <li>
            <button
              type="button"
              class="chip"
              class:selected={selectedId === item.id}
              class:used={cells.includes(item.id)}
              data-testid={`item-${item.id}`}
              onclick={() => tapPalette(item.id)}
            >
              <img src={iconUrl(item.icon)} alt="" width="64" height="64" />
              <span class="labels"><span class="en">{item.en}</span><span class="ja">{item.ja}</span></span>
            </button>
          </li>
        {/each}
      </ul>

      <details class="phrases">
        <summary>きくときの言い方</summary>
        <ul>
          {#each publicState.keyExpressions as phrase (phrase.en)}
            <li><span class="en">{phrase.en}</span><span class="ja">{phrase.ja}</span></li>
          {/each}
        </ul>
        <p class="note">{HINT_BLANK} はものの名前に置き換えてください。段は {rowWords}、横は left・right、細かい位置は {columnWords} from the left です。</p>
      </details>

      <button class="beb-btn yellow" data-testid="done" onclick={toggleDone}>
        <span>{isDone ? "まだ直す" : "できた"}</span>
      </button>

      <p class="count" data-testid="done-count">できた {publicState.donePlayerIds.length} / {listenerCount}</p>
    {/if}
  </div>
</main>

<style>
  .building {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .describer {
    display: grid;
    gap: 0.7rem;
  }
  .lead {
    margin: 0;
    text-align: center;
    font-size: 0.85rem;
    color: var(--mist);
  }
  .hints {
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.55rem 0.7rem;
  }
  h2 {
    margin: 0 0 0.3rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .hints .note {
    margin: 0 0 0.35rem;
    font-size: 0.7rem;
    color: var(--mist);
  }
  .hints ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .hints li {
    font-size: 0.88rem;
    line-height: 1.4;
  }
  .remaining {
    margin: 0.6rem 0 0.4rem;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
  }
  .remaining .warn {
    color: var(--yellow);
  }
  .palette {
    list-style: none;
    margin: 0 0 0.9rem;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem;
  }
  .chip {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--panel);
    color: var(--ink);
    border: 2px solid transparent;
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.5rem;
    font-family: var(--font-body);
    font-size: 0.86rem;
    cursor: pointer;
  }
  .chip.selected {
    border-color: var(--yellow);
    box-shadow: var(--shadow-tile);
  }
  .chip.used {
    opacity: 0.55;
  }
  .chip img {
    width: 32px;
    height: 32px;
    flex: none;
  }
  .chip .labels {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.15;
    min-width: 0;
  }
  .chip .ja {
    font-size: 0.66rem;
    color: var(--ink-soft);
  }
  .phrases {
    margin: 0 0 0.9rem;
    background: var(--ground-2);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }
  .phrases summary {
    cursor: pointer;
    color: var(--yellow);
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
  }
  .phrases ul {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .phrases li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    padding-bottom: 0.2rem;
  }
  .phrases .ja {
    color: var(--mist);
    font-size: 0.72rem;
  }
  .phrases .note {
    margin: 0.35rem 0 0;
    font-size: 0.7rem;
    color: var(--mist);
  }
  .count {
    margin: 0.5rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
