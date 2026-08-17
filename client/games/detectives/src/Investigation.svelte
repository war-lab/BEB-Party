<!-- 捜査画面。証言カード・制約・タイマー・質問テンプレート・役柄の再確認（基本設計/02、08） -->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import type { DetectivesPublic, DetectivesSecret } from "@beb/shared-detectives";
  import RoleCutIn from "./RoleCutIn.svelte";
  import StageTimer from "./StageTimer.svelte";
  import TestimonyCardView from "./TestimonyCardView.svelte";
  import { acquireWakeLock } from "./wake-lock.svelte";
  import { ui } from "@beb/client-core";

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

  $effect(() => acquireWakeLock());
</script>

<StageTimer deadline={room.deadline} />

<main class="investigation">
  <header>
    <h1>捜査</h1>
    <button class="role-button" onclick={() => (showRole = true)}>役柄を確認</button>
  </header>

  {#if secret}
    <section class="constraints" data-testid="constraints">
      <h2>このレベルの制約</h2>
      <ul>
        {#each secret.constraints as constraint (constraint)}
          <li>{constraint}</li>
        {/each}
      </ul>
    </section>

    {#if secret.questionTemplates}
      <section class="templates">
        <h2>質問のことば</h2>
        <ul>
          {#each secret.questionTemplates as template (template)}
            <li>{template}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="cards">
      <h2>あなたの証言</h2>
      {#each secret.cards as card (card.factId)}
        <TestimonyCardView {card} />
      {/each}
    </section>
  {:else}
    <p>証言を受信しています…</p>
  {/if}
</main>

{#if showRole && secret}
  <RoleCutIn isCulprit={secret.isCulprit} {characterName} onClose={() => (showRole = false)} />
{/if}

<style>
  .investigation {
    min-height: 100vh;
    background: var(--sky);
    color: var(--ink);
    font-family: var(--font-body);
    padding: 1rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1,
  h2 {
    font-family: var(--font-heading);
  }
  h2 {
    font-size: 1rem;
  }
  .role-button {
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-button);
    padding: 0.4rem 1rem;
    font-family: var(--font-heading);
  }
  .constraints ul,
  .templates ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .constraints li {
    background: var(--ink);
    color: var(--panel);
    border-radius: var(--radius-button);
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
  }
  .templates li {
    background: var(--panel);
    border: 1px solid var(--ink);
    border-radius: var(--radius-button);
    padding: 0.25rem 0.75rem;
  }
</style>
