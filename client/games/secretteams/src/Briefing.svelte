<!--
  遊び方の確認（基本設計/17のステージと画面）。

  遊び方、自分の単語とテーマ（伏せ面で開く）、選択肢6件、人数構成、説明の順番、
  言わない約束と画面を見せない約束、準備完了ボタンを出す。
  どのテーマのチームが何人かは出さない。テーマと人数を結び付けると本物のテーマが分かる（17の「チーム編成と人数構成」）。
-->
<script lang="ts">
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, LAPS, STAGES, type SecretTeamsPublic, type SecretTeamsSecret } from "@beb/shared-secretteams";
  import MyCard from "./MyCard.svelte";
  import SpeakerOrder from "./SpeakerOrder.svelte";
  import ThemeChoices from "./ThemeChoices.svelte";
  import WordCutIn from "./WordCutIn.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: SecretTeamsPublic;
    secret: SecretTeamsSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const myLevel = $derived(room.players.find((player) => player.id === ui.myPlayerId)?.level ?? 1);
  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
  const sizesText = $derived(publicState.teamSizes.map((size) => `${size}人`).join(" 対 "));

  let cutInClosed = $state(false);
</script>

<main class="briefing">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.briefing]} />

  <div class="body">
    <p class="guide" data-testid="stage-guide">自分の単語とテーマを確かめて、遊び方と約束を読みます。</p>

    {#if secret && cutInClosed}
      <MyCard {secret} choices={publicState.themeChoices} {myLevel} />
    {:else if !secret}
      <p class="waiting">単語を受け取っています…</p>
    {/if}

    <section class="how">
      <h2>遊び方</h2>
      <ul>
        <li>
          2チーム（<strong data-testid="team-sizes">{sizesText}</strong>）に分かれています。<strong>誰が味方かは知らされません。</strong>
        </li>
        <li>順番に、自分の単語を英語で遠回しに説明します。{LAPS}周します。聞いている人は英語で質問してかまいません。</li>
        <li>味方にだけ伝わるように説明し、他の人の説明から味方と相手チームのテーマを見抜きます。</li>
        <li>最後に、味方だと思う人（{publicState.maxAllyPicks}人まで）と、相手チームのテーマを伏せて回答します。</li>
      </ul>
    </section>

    <section class="choices">
      <h2>テーマの選択肢</h2>
      <p class="note">2チームのテーマはこの中にあります。近いテーマも混ざっています。</p>
      <ThemeChoices choices={publicState.themeChoices} myThemeId={cutInClosed ? (secret?.themeId ?? null) : null} {myLevel} />
    </section>

    <section class="order">
      <h2>説明の順番</h2>
      <SpeakerOrder {room} {publicState} />
    </section>

    <section class="promise" data-testid="oral-promises">
      <h2>約束</h2>
      <ul>
        <li>自分の単語とテーマ名は、そのまま言わない。</li>
        <li>自分の画面を他の人に見せない。</li>
      </ul>
    </section>

    <button class="beb-btn yellow" data-testid="ready" disabled={isReady} onclick={() => sendAction(ACTIONS.ready)}>
      <span>{isReady ? "準備できた" : "読んだ"}</span>
    </button>
    <p class="waiting" data-testid="ready-count">じゅんび {publicState.readyPlayerIds.length} / {connectedCount}</p>
  </div>
</main>

{#if secret && !cutInClosed}
  <WordCutIn {secret} choices={publicState.themeChoices} {myLevel} onClose={() => (cutInClosed = true)} />
{/if}

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
  .guide {
    margin: 0 0 0.7rem;
    background: var(--ground-2);
    border: var(--outline-width) solid var(--yellow);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--mist);
  }
  section {
    margin: 0 0 0.9rem;
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
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.25rem;
    font-size: 0.84rem;
    line-height: 1.5;
  }
  .note {
    margin: 0 0 0.4rem;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--mist);
  }
  .waiting {
    margin: 0.6rem 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
