<!--
  次の説明者を発表し、見本を渡す（基本設計/12のステージ）。

  見本は伏せ面のカットインで開く。交代のたびに隣の席から覗かれる位置で見本が開くため、
  DETECTIVESの配役発表と同じ手順を踏む（ビジュアルデザイン.md）。

  30秒の締切は数字で見せない。急かすと見本を読み終える前に開始を押す。
  締切そのものはサーバが持ち、到達すれば自動で配置へ進む。
-->
<script lang="ts">
  import { acquireWakeLock, faceColor, playerIconOf, ScoreBoard, SecretCover, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    HINT_BLANK,
    PLACE_COUNT,
    STAGES,
    describerPlayerIdOf,
    type BlindRoomPublic,
    type BlindRoomSecret,
    type DescriberSecret,
  } from "@beb/shared-blindroom";
  import BoardGrid from "./BoardGrid.svelte";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: BlindRoomPublic;
    secret: BlindRoomSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const describerId = $derived(describerPlayerIdOf(publicState));
  const isDescriber = $derived(ui.myPlayerId !== null && ui.myPlayerId === describerId);
  // このラウンドの秘密が届いているかを見る。前のラウンドの見本を出さないため、roundIndexで照合する
  const mine = $derived<DescriberSecret | null>(
    secret?.role === "describer" && secret.roundIndex === publicState.roundIndex ? secret : null,
  );
  const roundLabel = $derived(`${publicState.roundIndex + 1} / ${publicState.totalRounds}`);

  // 説明者は見本を読むあいだ画面に触らない。放置で消えないようにする（基本設計/02）
  $effect(() => acquireWakeLock());

  function nameOf(playerId: string | undefined): string {
    if (playerId === undefined) {
      return "";
    }
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="handoff">
  <StageTimer deadline={undefined} label={`${stageLabels[STAGES.handoff]} ${roundLabel}`} />

  <div class="body">
    <StageGuide step="handoff" isDescriber={isDescriber} />

    <h1 class="title">つぎの説明者</h1>

    <div class="tile" class:me={isDescriber}>
      <span class="face" style={`background:${faceColor(describerId ?? "")}`}>
        <span aria-hidden="true">{playerIconOf(describerId ?? "")}</span>
      </span>
      <span class="name">{nameOf(describerId)}</span>
    </div>

    <h2>得点</h2>
    <ScoreBoard {room} scores={publicState.scores} />
  </div>
</main>

{#if isDescriber && mine}
  <!-- 秘密が変わるたびに作り直す。同じインスタンスに中身だけ差し替えると伏せ面が開いたままになる -->
  {#key publicState.roundIndex}
    <SecretCover title="あなたが説明者です" mark="?" coverTestId="sample-cover">
      <!-- 開いた後のオーバーレイはゲーム側が持つ。SecretCoverは開いた時点で伏せ面を外し、
           childrenをその場に描くだけである（DON'T SAY ITのSpeakerCutInと同じ扱い） -->
      <div class="sample beb-stage-reveal" data-testid="sample-cutin">
        <p class="lead">この並びを英語で伝えてください（{PLACE_COUNT}個）</p>
        <BoardGrid cells={mine.sample} palette={publicState.palette} testId="sample-board" />

        {#if mine.hintEn.length > 0}
          <section class="hints" data-testid="my-hints">
            <h3>言い方の例</h3>
            <p class="note">{HINT_BLANK} はものの名前に置き換えてください。段は top・middle・bottom、横は left・right です。</p>
            <ul>
              {#each mine.hintEn as hint (hint)}
                <li>{hint}</li>
              {/each}
            </ul>
          </section>
        {/if}

        <p class="warning">他の人に見せない</p>
        <button class="beb-btn yellow" data-testid="start-round" onclick={() => sendAction(ACTIONS.startRound)}>
          <span>はじめる</span>
        </button>
      </div>
    </SecretCover>
  {/key}
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
  .title {
    font-family: var(--font-display);
    font-size: 1.5rem;
    margin: 0.2rem 0 0.7rem;
    transform: skew(var(--skew-angle));
    transform-origin: left bottom;
    text-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
  }
  .tile {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    background: var(--ground-2);
    border: 4px solid var(--red);
    border-radius: var(--radius-card);
    padding: 1rem;
    box-shadow: var(--shadow-tile);
  }
  .tile.me {
    border-color: var(--yellow);
  }
  .tile .face {
    --face-size: 3.2rem;
    border: 3px solid rgba(0, 0, 0, 0.3);
  }
  .tile .name {
    font-family: var(--font-display);
    font-size: 1.4rem;
  }
  h2 {
    margin: 1rem 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  /* 地は不透明にする。透けると後ろの得点表と重なって読めず、覗き見への備えにもならない */
  .sample {
    position: fixed;
    inset: 0;
    z-index: 1000;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.7rem;
    padding: 1.5rem 1.25rem calc(1.5rem + var(--footer-clearance));
    /* 説明者は黄。DON'T SAY ITが役ごとに地の色を変えているのと同じ扱いで、
       BLIND ROOMは「見本を持つ人」を1色で示す */
    background-color: var(--ground);
    --beb-reveal-glow: rgba(255, 196, 0, 0.32);
    color: var(--panel);
  }
  .sample .warning {
    margin: 0;
    text-align: center;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
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
  .hints h3 {
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
</style>
