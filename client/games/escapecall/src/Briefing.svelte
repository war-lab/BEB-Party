<!--
  作戦会議（基本設計/13のステージ）。舞台の導入、色と形の英語名、画面を見せない約束を全員へ見せる。

  手がかりはまだ配られていない。solving へ入った時点でサーバが配る。
  「じゅんびOK」でreadyを送る。全員が揃うか締切に達すると解錠へ進む。判定はサーバが行う。
-->
<script lang="ts">
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, STAGES, type EscapeCallPublic } from "@beb/shared-escapecall";
  import Glossary from "./Glossary.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: EscapeCallPublic;
  }
  let { room, publicState }: Props = $props();

  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
</script>

<main class="briefing">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.briefing]} />

  <div class="body">
    <section class="scene" data-testid="scene">
      <h2 class="title">{publicState.scene.titleEn}</h2>
      <p class="en">{publicState.scene.introEn}</p>
      <p class="ja">{publicState.scene.introJa}</p>
    </section>

    <section class="rule">
      <p>錠は3つ。手がかりはばらばらに配られ、自分の画面にだけ出ます。英語で伝え合って、数字の答えを組み立てます。</p>
      <p class="promise">自分の画面は、ほかの人に見せないでください。</p>
    </section>

    <section class="words">
      <h3>色と形の言い方</h3>
      <Glossary />
    </section>

    <section class="phrases">
      <h3>聞くときの言い方</h3>
      <ul>
        {#each publicState.keyExpressions as phrase (phrase.en)}
          <li><span class="en">{phrase.en}</span><span class="ja">{phrase.ja}</span></li>
        {/each}
      </ul>
    </section>

    <button class="beb-btn yellow" data-testid="ready" disabled={isReady} onclick={() => sendAction(ACTIONS.ready)}>
      <span>{isReady ? "まっています…" : "じゅんびOK"}</span>
    </button>
    <p class="waiting" data-testid="ready-count">じゅんび {publicState.readyPlayerIds.length} / {connectedCount}</p>
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
  .scene {
    margin: 0 0 0.8rem;
  }
  .title {
    margin: 0 0 0.3rem;
    font-family: var(--font-display);
    font-size: 1.3rem;
    color: var(--yellow);
    transform: skew(var(--skew-angle));
    transform-origin: left;
  }
  .scene .en {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.45;
  }
  .scene .ja {
    margin: 0.2rem 0 0;
    font-size: 0.76rem;
    color: var(--mist);
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
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .rule .promise {
    margin-top: 0.35rem;
    font-weight: bold;
    color: var(--red-deep);
  }
  h3 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .words,
  .phrases {
    margin: 0 0 1rem;
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
  .phrases .en {
    font-size: 0.86rem;
  }
  .phrases .ja {
    font-size: 0.7rem;
    color: var(--mist);
    text-align: right;
  }
  .waiting {
    margin: 0.6rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
