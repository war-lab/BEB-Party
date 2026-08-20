<!--
  順位の確定（基本設計/10のステージ）。

  ホストは卓で決まった順位を▲▼で並べて提案する。スマホでのドラッグ操作は誤操作が多いため使わない。
  提案は全員に見え、接続中の全員が承認した時点でサーバが確定させる。
  差し替えると承認は取り消される（判定はサーバが行う）。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, STAGES, type RankingPublic, type RankingSecret } from "@beb/shared-ranking";
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: RankingPublic;
    secret: RankingSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const roundLabel = $derived(`${publicState.roundIndex + 1} / ${publicState.totalRounds}`);
  const isHost = $derived(room.players.some((player) => player.id === ui.myPlayerId && player.isHost));
  const myGoal = $derived(secret?.roundIndex === publicState.roundIndex ? secret : null);
  const hasApproved = $derived(ui.myPlayerId !== null && publicState.approvedPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);

  /** ホストが編集中の並び。itemIdの配列で持つ */
  let draft = $state<string[]>([]);

  // ラウンドが変わったときだけ組み直す。Roomの参照を条件にすると、state を受信するたびに
  // 編集中の並びが初期値へ戻る（DON'T SAY ITのロビーで実測した退行と同じ経路。ADR-0018）
  let appliedRoundIndex: number | null = null;
  $effect(() => {
    if (appliedRoundIndex === publicState.roundIndex) {
      return;
    }
    appliedRoundIndex = publicState.roundIndex;
    draft = publicState.proposedRanking ?? publicState.items.map((item) => item.id);
  });

  function labelOf(itemId: string): { en: string; ja: string } {
    const item = publicState.items.find((entry) => entry.id === itemId);
    return { en: item?.en ?? itemId, ja: item?.ja ?? "" };
  }

  function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= draft.length) {
      return;
    }
    const next = [...draft];
    const a = next[index] as string;
    const b = next[target] as string;
    next[index] = b;
    next[target] = a;
    draft = next;
  }

  function propose(): void {
    sendAction(ACTIONS.proposeRanking, { ranking: draft });
  }

  function approve(): void {
    sendAction(ACTIONS.approveRanking);
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="confirming">
  <StageTimer deadline={room.deadline} label={`${stageLabels[STAGES.confirming]} ${roundLabel}`} />

  <div class="body">
    <StageGuide step="confirming" {isHost} />

    <section class="question">
      <p class="q-en">{publicState.question.en}</p>
    </section>

    {#if isHost}
      <section class="editor">
        <h2>卓で決まった順位</h2>
        <ol class="rows" data-testid="ranking-editor">
          {#each draft as itemId, index (itemId)}
            <li>
              <span class="rank">{index + 1}</span>
              <span class="labels">
                <span class="en">{labelOf(itemId).en}</span>
                <span class="ja">{labelOf(itemId).ja}</span>
              </span>
              <span class="arrows">
                <button
                  type="button"
                  aria-label={`${labelOf(itemId).en} を上へ`}
                  data-testid={`move-up-${itemId}`}
                  disabled={index === 0}
                  onclick={() => move(index, -1)}>▲</button
                >
                <button
                  type="button"
                  aria-label={`${labelOf(itemId).en} を下へ`}
                  data-testid={`move-down-${itemId}`}
                  disabled={index === draft.length - 1}
                  onclick={() => move(index, 1)}>▼</button
                >
              </span>
            </li>
          {/each}
        </ol>
        <button class="beb-btn yellow" onclick={propose} data-testid="propose"><span>この順位にする</span></button>
      </section>
    {/if}

    {#if publicState.proposedRanking}
      <section class="proposal" data-testid="proposal">
        <h2>いまの提案</h2>
        <ol class="rows readonly">
          {#each publicState.proposedRanking as itemId, index (itemId)}
            <li>
              <span class="rank">{index + 1}</span>
              <span class="labels">
                <span class="en">{labelOf(itemId).en}</span>
                <span class="ja">{labelOf(itemId).ja}</span>
              </span>
            </li>
          {/each}
        </ol>

        <p class="count" data-testid="approve-count">
          承認 {publicState.approvedPlayerIds.length} / {connectedCount}
        </p>
        {#if publicState.approvedPlayerIds.length > 0}
          <p class="who">{publicState.approvedPlayerIds.map((playerId) => nameOf(playerId)).join("、")}</p>
        {/if}

        <button class="beb-btn" onclick={approve} disabled={hasApproved} data-testid="approve">
          <span>{hasApproved ? "承認ずみ" : "承認する"}</span>
        </button>
      </section>
    {:else}
      <p class="empty">ホストが順位を入れるのを待っています。</p>
    {/if}

    {#if myGoal}
      <section class="goal">
        <h2>あなたの目標</h2>
        <p class="goal-ja">{myGoal.goal.ja}</p>
      </section>
    {/if}
  </div>
</main>

<style>
  .confirming {
    min-height: 100vh;
    background: linear-gradient(180deg, #131c33, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .question {
    margin: 0 0 0.8rem;
  }
  .q-en {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.05rem;
    color: var(--yellow);
  }
  h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .editor,
  .proposal,
  .goal {
    margin: 0 0 1rem;
  }
  .rows {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .rows li {
    display: grid;
    grid-template-columns: 1.4rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.6rem;
  }
  .rows.readonly li {
    border-color: var(--yellow);
  }
  .rank {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 1rem;
    color: var(--yellow);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .labels {
    display: grid;
    gap: 0.05rem;
  }
  .labels .en {
    font-family: var(--font-display);
    font-size: 1rem;
  }
  .labels .ja {
    font-size: 0.7rem;
    color: var(--mist);
  }
  .arrows {
    display: flex;
    gap: 0.3rem;
  }
  .arrows button {
    width: 2.1rem;
    height: 2.1rem;
    border: 2px solid rgba(255, 255, 255, 0.25);
    border-radius: var(--radius-button);
    background: var(--ground);
    color: var(--panel);
    font-size: 0.8rem;
    line-height: 1;
  }
  .arrows button:disabled {
    opacity: 0.35;
  }
  .count {
    margin: 0 0 0.2rem;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
  .who {
    margin: 0 0 0.5rem;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .empty {
    margin: 0 0 1rem;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
  }
  .goal-ja {
    margin: 0;
    background: var(--blue-deep);
    border: 2px solid var(--blue);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
  }
</style>
