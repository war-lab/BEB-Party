<!--
  開示 → 振り返り（基本設計/02、08）。
  勝敗は result.outcome をそのまま表示する。クライアントで集計しない（基本設計/02の禁止事項）。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import type { DetectivesPublic, DetectivesResult } from "@beb/shared-detectives";
  import { sendCommon, ui } from "@beb/client-core";

  interface Props {
    room: Room;
    publicState: DetectivesPublic;
    result: DetectivesResult | null;
    onLeave: () => void;
  }
  let { room, publicState, result, onLeave }: Props = $props();

  // 段階的な開示。溜めを飛ばしたい場合に備え、次へ進むのは本人の操作とする
  type Step = "verdict" | "lie" | "contradictions" | "review";
  const STEPS: Step[] = ["verdict", "lie", "contradictions", "review"];
  let stepIndex = $state(0);
  const step = $derived(STEPS[stepIndex] ?? "review");

  const isHost = $derived(room.players.find((player) => player.id === ui.myPlayerId)?.isHost ?? false);

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function characterNameOf(playerId: string): string {
    return publicState.cast.find((entry) => entry.playerId === playerId)?.characterName ?? "";
  }

  function next(): void {
    stepIndex = Math.min(stepIndex + 1, STEPS.length - 1);
  }
</script>

<main class="reveal">
  {#if !result}
    <p>結果を受信しています…</p>
  {:else}
    <h1 class="outcome" data-testid="outcome">
      {result.outcome === "citizens" ? "市民の勝ち" : "犯人の勝ち"}
    </h1>

    <section class="culprit">
      <h2>犯人</h2>
      <p class="culprit-name">
        {nameOf(result.culprit.playerId)}（{characterNameOf(result.culprit.playerId)}）
      </p>
    </section>

    {#if stepIndex >= STEPS.indexOf("lie")}
      <section class="lie">
        <h2>嘘だった証言</h2>
        <p class="en">{result.lieCard.textEn}</p>
        <p class="hint">{result.lieCard.hintJa}</p>
      </section>
    {/if}

    {#if stepIndex >= STEPS.indexOf("contradictions")}
      <section class="contradictions">
        <h2>どこで矛盾したか</h2>
        {#each result.contradictions as contradiction (contradiction.meaningJa)}
          <article>
            <p class="meaning">{contradiction.meaningJa}</p>
            <ul>
              {#each contradiction.supportingCards as card (card.textEn)}
                <li><span class="who">{card.characterName}</span><span class="en">{card.textEn}</span></li>
              {/each}
            </ul>
          </article>
        {/each}
      </section>
    {/if}

    {#if step === "review"}
      <section class="review">
        <h2>真相</h2>
        <ol class="timeline">
          {#each result.timelineEn as line (line)}
            <li>{line}</li>
          {/each}
        </ol>

        <h2>使える表現</h2>
        <ul class="expressions">
          {#each result.keyExpressions as expression (expression.en)}
            <li><span class="en">{expression.en}</span><span class="ja">{expression.ja}</span></li>
          {/each}
        </ul>

        <h2>投票</h2>
        <ul class="votes">
          {#each result.votes as vote (vote.voterPlayerId)}
            <li>{nameOf(vote.voterPlayerId)} → {nameOf(vote.targetPlayerId)}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="actions">
      {#if step !== "review"}
        <button class="primary" onclick={next}>つづき</button>
      {:else if isHost}
        <button class="primary" onclick={() => sendCommon({ type: "nextGame" })}>ロビーへ戻る</button>
      {/if}
      <button class="secondary" onclick={onLeave}>退出する</button>
    </div>
  {/if}
</main>

<style>
  .reveal {
    min-height: 100vh;
    background: var(--ground);
    color: var(--panel);
    font-family: var(--font-body);
    padding: 1rem 1rem calc(1rem + var(--footer-clearance));
  }
  h1 {
    font-family: var(--font-display);
  }
  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
  }
  .outcome {
    font-size: 2rem;
    transform: skewY(var(--skew-angle));
    margin: 1rem 0;
  }
  .culprit-name {
    font-size: 1.25rem;
    font-weight: 700;
  }
  .en {
    font-size: 1.1rem;
    line-height: 1.5;
  }
  .hint {
    font-size: 0.85rem;
    opacity: 0.8;
  }
  .contradictions article {
    background: rgba(247, 248, 253, 0.08);
    border-radius: var(--radius-card);
    padding: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .meaning {
    margin: 0 0 0.5rem;
  }
  .contradictions ul,
  .expressions,
  .votes,
  .timeline {
    padding-left: 1.2rem;
  }
  .contradictions li,
  .expressions li {
    display: flex;
    flex-direction: column;
    margin-bottom: 0.5rem;
  }
  .who {
    font-size: 0.8rem;
    opacity: 0.8;
  }
  .ja {
    font-size: 0.85rem;
    opacity: 0.8;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }
  .primary {
    background: var(--yellow);
    color: var(--ink);
    border: none;
    border-radius: var(--radius-button);
    padding: 0.75rem 2rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    box-shadow: var(--shadow-hard);
  }
  .secondary {
    background: none;
    color: var(--panel);
    border: var(--outline-width) solid var(--panel);
    border-radius: var(--radius-button);
    padding: 0.75rem 1.5rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
  }
</style>
