<!--
  次の説明者を発表する。説明者の端末にだけ開始ボタンを出す（ビジュアルデザイン.mdの画面別の要点）。

  30秒の締切は数字で見せない。急かすとカードを読み終える前に開始を押す。
  締切そのものはサーバが持ち、到達すれば自動でexplainingへ進む（基本設計/09）。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    STAGES,
    speakerPlayerIdOf,
    watcherPlayerIdOf,
    type DontSayItPublic,
    type DontSayItSecret,
    type SpeakerSecret,
  } from "@beb/shared-dontsayit";
  import { faceColor, sendAction, ui } from "@beb/client-core";
  import ScoreBoard from "./ScoreBoard.svelte";
  import StageGuide from "./StageGuide.svelte";
  import StageTimer from "./StageTimer.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: DontSayItPublic;
    secret: DontSayItSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const speakerId = $derived(speakerPlayerIdOf(publicState));
  const watcherId = $derived(watcherPlayerIdOf(publicState));
  const isSpeaker = $derived(ui.myPlayerId !== null && ui.myPlayerId === speakerId);
  const speakerSecret = $derived(secret?.role === "speaker" ? (secret as SpeakerSecret) : null);
  const roundLabel = $derived(`${publicState.roundIndex + 1} / ${publicState.speakerOrder.length}`);

  function nameOf(playerId: string | undefined): string {
    if (playerId === undefined) {
      return "";
    }
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function startRound(): void {
    sendAction(ACTIONS.startRound);
  }
</script>

<main class="handoff">
  <StageTimer deadline={undefined} label={`${stageLabels[STAGES.handoff]} ${roundLabel}`} />

  <div class="body">
    <StageGuide step="handoff" isNextSpeaker={isSpeaker} />

    <h1 class="title">つぎの説明者</h1>

    <div class="tile" class:me={isSpeaker}>
      <span class="face" style={`background:${faceColor(speakerId ?? "")}`}></span>
      <span class="name">{nameOf(speakerId)}</span>
    </div>

    <p class="watcher">監視役: {nameOf(watcherId)}</p>

    {#if isSpeaker && speakerSecret}
      <section class="beb-card preview">
        <p class="label">あなたのお題</p>
        <p class="answer">{speakerSecret.card.answer}</p>
        <p class="label">使えない語</p>
        <ul class="taboo">
          {#each speakerSecret.card.taboo as word (word)}
            <li>{word}</li>
          {/each}
        </ul>
        {#if publicState.constraint}
          <p class="constraint">{publicState.constraint.ja}（{publicState.constraint.en}）</p>
        {/if}
      </section>

      <button class="beb-btn red" onclick={startRound}>
        <span>はじめる</span>
      </button>
    {:else}
      <h2>得点</h2>
      <ScoreBoard {room} scores={publicState.scores} />
    {/if}
  </div>
</main>

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

  /* ロビーと同じ正方形タイルを持ち上げて示す */
  .tile {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    background: var(--ground-2);
    border: 4px solid var(--red);
    border-radius: var(--radius-card);
    padding: 1rem;
    transform: translateY(-4px);
    box-shadow: var(--shadow-tile);
  }
  .tile.me {
    border-color: var(--yellow);
  }
  .tile .face {
    display: block;
    width: 3.2rem;
    height: 3.2rem;
    border-radius: 50%;
    border: 3px solid rgba(0, 0, 0, 0.3);
  }
  .tile .name {
    font-family: var(--font-display);
    font-size: 1.4rem;
  }

  .watcher {
    margin: 0.7rem 0 0;
    font-size: 0.82rem;
    color: var(--mist);
  }

  .preview {
    margin-top: 0.9rem;
  }
  .label {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: var(--red-deep);
    margin: 0 0 0.2rem;
  }
  .answer {
    font-family: var(--font-display);
    font-size: 1.8rem;
    color: var(--ink);
    margin: 0 0 0.7rem;
    line-height: 1.2;
  }
  .taboo {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .taboo li {
    background: var(--red);
    color: var(--panel);
    border-radius: var(--radius-button);
    padding: 0.2rem 0.55rem;
    font-size: 0.86rem;
    font-weight: 700;
  }
  .constraint {
    margin: 0.7rem 0 0;
    background: var(--yellow);
    color: var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    font-weight: 700;
  }

  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
    margin: 1.1rem 0 0.35rem;
  }
</style>
