<!--
  ホスト画面（`/room/:code?mode=host`）。ステージ名・タイマー・参加者だけを大きく出す読み取り専用モード。
  観戦ソケットで接続するため `secret` は届かず、入力系UIは一切置かない（基本設計/02）。
  ステージ名の表示文言だけをゲームモジュールから引く（共通コアはゲームIDで分岐しない。ADR-0009）
-->
<script lang="ts">
  import { serverState } from "../stores/server-state.svelte";
  import { playerIconEmoji } from "@beb/shared-core";
  import { faceColor } from "../face-color";
  import { createServerClock, formatClock } from "../server-clock.svelte";

  interface Props {
    code: string;
    // gameId→ステージ表示文言のローダー。client/appが組み立てて渡す（基本設計/07）
    gameStageLabels: Record<string, () => Promise<{ default: Record<string, string> }>>;
  }
  let { code, gameStageLabels }: Props = $props();

  let labels = $state<Record<string, string>>({});
  const clock = createServerClock();

  const room = $derived(serverState.room);

  $effect(() => {
    const gameId = room?.gameId;
    if (!gameId) {
      labels = {};
      return;
    }
    const loader = gameStageLabels[gameId];
    if (!loader) {
      labels = {};
      return;
    }
    loader().then((mod) => {
      labels = mod.default;
    });
  });

  // タイマーはサーバ権威。受信したdeadlineを描くだけで、時間切れの判定はしない（基本設計/02）
  const remainingSeconds = $derived(clock.remaining(room?.deadline));

  const stageName = $derived.by(() => {
    if (!room) {
      return "接続中…";
    }
    if (room.lifecycle === "lobby") {
      return "参加者を待っています";
    }
    return (room.stage && labels[room.stage]) || room.stage || "";
  });

</script>

<main class="host" data-testid="host-view">
  <header class="head">
    <span class="lbl">ROOM CODE</span>
    <span class="code">{code}</span>
  </header>

  <section class="stage">
    <p class="stage-name" data-testid="host-stage">{stageName}</p>
    {#if remainingSeconds !== null}
      <p class="timer" data-testid="host-timer">{formatClock(remainingSeconds)}</p>
    {/if}
  </section>

  <section class="roster" aria-label="参加者">
    {#each room?.players ?? [] as player (player.id)}
      <div class="tile" class:disconnected={!player.connected}>
        <span class="face" style={`background:${faceColor(player.id)}`}>
          <span aria-hidden="true">{playerIconEmoji(player.icon)}</span>
        </span>
        <span class="name">{player.name}</span>
        <span class="lv">Lv.{player.level}</span>
        {#if player.isHost}
          <span class="badge is-host">HOST</span>
        {/if}
        {#if !player.connected}
          <span class="badge is-offline">切断中</span>
        {/if}
      </div>
    {/each}
  </section>

  <!-- フッターの操作ボタンは出さないため、書体の表記だけを静的に置く（ビジュアルデザイン.md） -->
  <footer class="credit">書体: Dela Gothic One / M PLUS Rounded 1c（SIL Open Font License 1.1）</footer>
</main>

<style>
  .host {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2vh;
    padding: 3vh 3vw;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
  }
  .lbl {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: clamp(0.8rem, 1.6vw, 1.4rem);
    color: var(--mist);
    letter-spacing: 0.16em;
  }
  .code {
    font-family: var(--font-display);
    font-size: clamp(2rem, 6vw, 5rem);
    color: var(--yellow);
    letter-spacing: 0.16em;
  }

  .stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1vh;
  }
  .stage-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 7vw, 6rem);
    text-align: center;
    line-height: 1.15;
  }
  .timer {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    font-size: clamp(3rem, 16vw, 14rem);
    color: var(--yellow);
    line-height: 1;
  }

  .roster {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: clamp(0.5rem, 1.5vw, 1.5rem);
  }
  .tile {
    position: relative;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-tile);
    box-shadow: var(--shadow-tile);
    padding: clamp(0.5rem, 1vw, 1rem) clamp(0.7rem, 1.4vw, 1.4rem);
    text-align: center;
    font-family: var(--font-body);
  }
  .tile.disconnected {
    opacity: 0.55;
  }
  .face {
    /* 大画面向けに絵文字も円と一緒に拡大する */
    font-size: clamp(1.1rem, 2.4vw, 2.4rem);
    width: clamp(2rem, 4vw, 4rem);
    height: clamp(2rem, 4vw, 4rem);
    border-radius: 50%;
    margin: 0 auto 0.3rem;
    border: var(--outline-width) solid var(--ink);
  }
  .name {
    display: block;
    font-size: clamp(0.9rem, 1.8vw, 1.8rem);
    font-weight: 700;
    line-height: 1.2;
    max-width: 12rem;
    overflow-wrap: anywhere;
  }
  .lv {
    font-size: clamp(0.7rem, 1.2vw, 1.1rem);
    font-weight: 700;
    color: #fff;
    background: var(--blue);
    border-radius: var(--radius-button);
    display: inline-block;
    padding: 0.05rem 0.6rem;
    margin-top: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  .badge {
    position: absolute;
    top: -0.6rem;
    right: -0.5rem;
    border-radius: var(--radius-button);
    padding: 0.05rem 0.55rem;
    font-size: clamp(0.6rem, 1vw, 0.9rem);
    font-family: var(--font-display);
  }
  .badge.is-host {
    background: var(--red);
    color: #fff;
    transform: rotate(6deg);
  }
  .badge.is-offline {
    top: auto;
    bottom: -0.6rem;
    right: -0.5rem;
    background: var(--ink);
    color: var(--mist);
  }

  .credit {
    font-family: var(--font-body);
    font-size: clamp(0.6rem, 1vw, 0.85rem);
    color: var(--mist);
  }
</style>
