<!--
  開示リザルト（ビジュアルデザイン.mdのモック `.s-reveal`）。放射スピードライン＋犯人名ズーム。
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

  // 段階的な開示。次へ進むのは本人の操作とする
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

  function levelOf(playerId: string): number | undefined {
    return room.players.find((player) => player.id === playerId)?.level;
  }

  function next(): void {
    stepIndex = Math.min(stepIndex + 1, STEPS.length - 1);
  }
</script>

<main class="reveal">
  {#if !result}
    <p class="waiting">結果を受信しています…</p>
  {:else}
    <section class="stage">
      <p class="rev-pre">犯人は…</p>
      <p class="rev-name">{nameOf(result.culprit.playerId)}</p>
      <p class="rev-role">
        {characterNameOf(result.culprit.playerId)}（Lv.{levelOf(result.culprit.playerId) ?? "-"}）
      </p>
      <p class="rev-banner" data-testid="outcome">
        {result.outcome === "citizens" ? "市民の勝利！" : "犯人の勝利！"}
      </p>
    </section>

    <div class="panels">
      {#if stepIndex >= STEPS.indexOf("lie")}
        <section class="rev-lie beb-card">
          <p class="lie-head">嘘カード</p>
          <p class="en">{result.lieCard.textEn}</p>
          <p class="ja">ヒント：{result.lieCard.hintJa}</p>
        </section>
      {/if}

      {#if stepIndex >= STEPS.indexOf("contradictions")}
        <section class="beb-card">
          <p class="panel-head">どこで矛盾したか</p>
          {#each result.contradictions as contradiction (contradiction.meaningJa)}
            <p class="meaning">{contradiction.meaningJa}</p>
            <ul class="supporting">
              {#each contradiction.supportingCards as card (card.textEn)}
                <li>
                  <span class="who">{card.characterName}</span>
                  <span class="en small">{card.textEn}</span>
                </li>
              {/each}
            </ul>
          {/each}
        </section>
      {/if}

      {#if step === "review"}
        <section class="beb-card">
          <p class="panel-head">真相</p>
          <ol class="timeline">
            {#each result.timelineEn as line (line)}
              <li>{line}</li>
            {/each}
          </ol>
        </section>

        <section class="beb-card">
          <p class="panel-head">使える表現</p>
          <ul class="expressions">
            {#each result.keyExpressions as expression (expression.en)}
              <li><span class="en small">{expression.en}</span><span class="ja">{expression.ja}</span></li>
            {/each}
          </ul>
        </section>

        <section class="beb-card">
          <p class="panel-head">投票</p>
          <ul class="votes">
            {#each result.votes as vote (vote.voterPlayerId)}
              <li>{nameOf(vote.voterPlayerId)} → {nameOf(vote.targetPlayerId)}</li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    <div class="actions">
      {#if step !== "review"}
        <button class="beb-btn yellow" onclick={next}><span>つづき</span></button>
      {:else if isHost}
        <button class="beb-btn yellow" onclick={() => sendCommon({ type: "nextGame" })}><span>ロビーへ戻る</span></button>
      {/if}
      <button class="beb-btn ghost" onclick={onLeave}><span>退出する</span></button>
    </div>
  {/if}
</main>

<style>
  .reveal {
    min-height: 100vh;
    background-color: var(--ground);
    background-image:
      repeating-conic-gradient(from 0deg at 50% 30%, rgba(255, 255, 255, 0.07) 0deg 7deg, transparent 7deg 14deg),
      radial-gradient(circle at 50% 30%, #22307a 0%, var(--ground) 70%);
    color: var(--panel);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    /* 判定だけの段は中央に置き、パネルが増えたら上から積む（モックの `.s-reveal`） */
    justify-content: center;
    padding: 1.2rem 0.9rem calc(1.2rem + var(--footer-clearance));
    gap: 0.9rem;
  }

  .stage {
    text-align: center;
    display: grid;
    gap: 0.2rem;
  }

  .rev-pre {
    font-family: var(--font-display);
    font-size: 0.95rem;
    color: var(--mist);
    transform: skew(var(--skew-angle));
    margin: 0;
  }
  .rev-name {
    font-family: var(--font-display);
    font-size: 3rem;
    line-height: 1.05;
    color: var(--red);
    transform: skew(var(--skew-angle)) rotate(-2deg);
    text-shadow: 0 6px 0 rgba(0, 0, 0, 0.45);
    margin: 0;
    animation: zoom var(--motion-duration) var(--motion-easing);
  }
  @keyframes zoom {
    from {
      transform: skew(var(--skew-angle)) rotate(-2deg) scale(0.7);
      opacity: 0;
    }
    to {
      transform: skew(var(--skew-angle)) rotate(-2deg) scale(1);
      opacity: 1;
    }
  }
  .rev-role {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.8rem;
    color: #dde2f6;
    margin: 0;
  }
  .rev-banner {
    justify-self: center;
    margin: 0.8rem 0 0;
    font-family: var(--font-display);
    font-size: 1.2rem;
    color: var(--ink);
    background: var(--yellow);
    padding: 0.4rem 1.3rem;
    border-radius: var(--radius-button);
    transform: skew(var(--skew-angle));
    box-shadow: var(--shadow-hard);
  }

  .panels {
    display: grid;
    gap: 0.7rem;
  }

  .rev-lie {
    border-color: var(--red);
  }
  .lie-head,
  .panel-head {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--red-deep);
  }
  .panel-head {
    color: var(--blue-deep);
  }

  .en {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.45;
    color: var(--ink);
  }
  .en.small {
    font-size: 0.9rem;
  }
  .ja {
    margin: 0.3rem 0 0;
    font-size: 0.75rem;
    color: var(--ink-soft);
  }

  .meaning {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    color: var(--ink);
  }

  .supporting,
  .timeline,
  .expressions,
  .votes {
    margin: 0;
    padding-left: 1.1rem;
    color: var(--ink);
  }
  .supporting {
    list-style: none;
    padding-left: 0;
  }
  .supporting li,
  .expressions li {
    display: grid;
    margin-bottom: 0.45rem;
  }
  .who {
    font-size: 0.68rem;
    color: var(--ink-soft);
  }
  .timeline li,
  .votes li {
    font-size: 0.85rem;
    margin-bottom: 0.2rem;
  }

  .actions {
    display: grid;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  /* 退出は主要動線ではないので小さく置く */
  .actions .beb-btn.ghost {
    font-size: 0.8rem;
    padding: 0.45rem 0.6rem;
    justify-self: center;
    width: auto;
    min-width: 9rem;
  }

  .waiting {
    color: var(--mist);
    text-align: center;
  }
</style>
