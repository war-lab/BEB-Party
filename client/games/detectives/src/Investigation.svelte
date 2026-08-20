<!-- 捜査HUD（ビジュアルデザイン.mdのモック `.s-inv`）。深紺の地、上部に太いタイマー、白カードで可読性最優先 -->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, STAGES, type DetectivesPublic, type DetectivesSecret } from "@beb/shared-detectives";
  import RoleCutIn from "./RoleCutIn.svelte";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";
  import TestimonyCardView from "./TestimonyCardView.svelte";
  import { acquireWakeLock, sendAction, StageTimer, ui } from "@beb/client-core";

  interface Props {
    room: Room;
    publicState: DetectivesPublic;
    secret: DetectivesSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  // 役柄の再確認。再表示のたびに同じ伏せ面を経由させる（基本設計/02）
  let showRole = $state(false);

  const characterName = $derived(
    publicState.cast.find((entry) => entry.playerId === ui.myPlayerId)?.characterName ?? "",
  );
  const isHost = $derived(room.players.find((player) => player.id === ui.myPlayerId)?.isHost ?? false);

  $effect(() => acquireWakeLock());
</script>

<main class="investigation">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.investigation]} />

  <div class="body">
    <header>
      <span class="role-label">{characterName}</span>
      <button class="role-button" onclick={() => (showRole = true)}>役柄を確認</button>
    </header>

    <StageGuide
      step="investigation"
      deadline={room.deadline}
      hostNote={isHost ? "全員が話し終わったら、下の「投票へ進む」で早めに切り上げられます" : undefined}
    />

    {#if secret}
      <section class="constraints" data-testid="constraints">
        <h2>このレベルの制約</h2>
        <ul>
          {#each secret.constraints as constraint (constraint)}
            <li>{constraint}</li>
          {/each}
        </ul>
      </section>

      <section class="cards">
        <h2>あなたの証言</h2>
        {#each secret.cards as card (card.factId)}
          <TestimonyCardView {card} />
        {/each}
      </section>

      {#if secret.questionTemplates}
        <section class="templates">
          <h2>質問のことば</h2>
          <ul class="q-row">
            {#each secret.questionTemplates as template (template)}
              <li class="q">{template}</li>
            {/each}
          </ul>
        </section>
      {/if}
    {:else}
      <p class="waiting">証言を受信しています…</p>
    {/if}

    {#if isHost}
      <button class="beb-btn red end" onclick={() => sendAction(ACTIONS.endInvestigation)}>
        <span>投票へ進む</span>
      </button>
    {/if}
  </div>
</main>

{#if showRole && secret}
  <RoleCutIn isCulprit={secret.isCulprit} {characterName} onClose={() => (showRole = false)} />
{/if}

<style>
  .investigation {
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
    padding: 0.75rem 0.75rem calc(0.75rem + var(--footer-clearance));
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .role-label {
    font-family: var(--font-display);
    font-size: 0.95rem;
    color: var(--yellow);
    transform: skew(var(--skew-angle));
  }

  .role-button {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.75rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-button);
    padding: 0.25rem 0.8rem;
    cursor: pointer;
  }

  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
    margin: 0.8rem 0 0.35rem;
  }

  .constraints ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .constraints li {
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.16);
    color: var(--panel);
    border-radius: var(--radius-button);
    padding: 0.2rem 0.7rem;
    font-size: 0.75rem;
  }

  .q-row {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .q {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--ink);
    background: #dce9ff;
    border: 2px solid var(--blue);
    border-radius: var(--radius-button);
    padding: 0.25rem 0.7rem;
  }

  .waiting {
    color: var(--mist);
  }

  .end {
    margin-top: 1.1rem;
  }
</style>
