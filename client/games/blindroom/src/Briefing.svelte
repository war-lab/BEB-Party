<!--
  ゲームの始まり。このラウンドで使うアイテムの英語名と、質問に使う言い回しを全員へ見せる
  （基本設計/12のステージ）。

  伏せ面のカットインは挟まない。パレットは全員に公開する値であり、隠す情報がない。
  「かくにんした」でreadyを送る。全員が揃うか締切に達すると説明者の交代へ進む。判定はサーバが行う。
-->
<script lang="ts">
  import { ScoreBoard, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, PLACE_COUNT, STAGES, boardSizeOf, iconUrl, type BlindRoomPublic } from "@beb/shared-blindroom";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: BlindRoomPublic;
  }
  let { room, publicState }: Props = $props();

  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  // 盤面の広さはホストが選ぶ。固定で「3×3」と書くと、既定（4×3）で遊ぶ卓に誤った説明が出る
  const board = $derived(boardSizeOf(publicState.boardSizeId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
</script>

<main class="briefing">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.briefing]} />

  <div class="body">
    <StageGuide step="briefing" />

    <section class="rule">
      <p>
        {board.columns}×{board.rows}のマスに{PLACE_COUNT}個ならべます。
        説明者だけが見本を見て、英語だけで伝えます。
      </p>
      <p class="note">説明者は{publicState.totalRounds}人が1回ずつ交代します。</p>
    </section>

    <section class="palette" data-testid="palette">
      <h2>つかうもの</h2>
      <ul>
        {#each publicState.palette as item (item.id)}
          <li>
            <img src={iconUrl(item.icon)} alt="" width="64" height="64" />
            <span class="en">{item.en}</span>
            <span class="ja">{item.ja}</span>
          </li>
        {/each}
      </ul>
    </section>

    <section class="phrases">
      <h2>きくときの言い方</h2>
      <ul>
        {#each publicState.keyExpressions as phrase (phrase.en)}
          <li><span class="en">{phrase.en}</span><span class="ja">{phrase.ja}</span></li>
        {/each}
      </ul>
    </section>

    {#if publicState.rounds.length > 0}
      <section class="scores">
        <h2>ここまでの得点</h2>
        <ScoreBoard {room} scores={publicState.scores} />
      </section>
    {/if}

    <button class="beb-btn yellow" data-testid="ready" disabled={isReady} onclick={() => sendAction(ACTIONS.ready)}>
      <span>{isReady ? "まっています…" : "かくにんした"}</span>
    </button>

    <p class="waiting" data-testid="ready-count">
      かくにん {publicState.readyPlayerIds.length} / {connectedCount}
    </p>
  </div>
</main>

<style>
  .briefing {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .rule {
    margin: 0 0 0.9rem;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 0.7rem 0.8rem;
  }
  .rule p {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.5;
  }
  .rule .note {
    margin-top: 0.3rem;
    font-size: 0.76rem;
    color: var(--ink-soft);
  }
  h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .palette,
  .phrases,
  .scores {
    margin: 0 0 1rem;
  }
  .palette ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.3rem;
  }
  .palette li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--ground-2);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.45rem;
  }
  .palette img {
    width: 32px;
    height: 32px;
    flex: none;
  }
  .palette .en,
  .phrases .en {
    font-size: 0.86rem;
  }
  .palette .ja,
  .phrases .ja {
    font-size: 0.7rem;
    color: var(--mist);
  }
  .phrases ul {
    list-style: none;
    margin: 0;
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
  .waiting {
    margin: 0.6rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
