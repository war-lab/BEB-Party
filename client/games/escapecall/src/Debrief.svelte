<!--
  ふりかえり（基本設計/13のステージ）。脱出の成否とランク、3つの錠の答えと断片の全部を出す。

  開かなかった錠も出す。聞き違いか規則の読み違いかを振り返れるようにするためである（13の結果）。
  finishedのまま再接続した人へは共通コアが lastResult を再送するため、公開状態に依存しない。
  ロビーへ戻す操作は nextGame の送信だけとする。切断はしない。
-->
<script lang="ts">
  import { faceColor, playerIconOf, sendCommon, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { STAGES, type EscapeCallResult, type PieceKind } from "@beb/shared-escapecall";
  import SymbolIcon from "./SymbolIcon.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    result: EscapeCallResult | null;
    onLeave: () => void;
  }
  let { room, result, onLeave }: Props = $props();

  const KIND_LABELS: Record<PieceKind, string> = { order: "錠の記号", map: "数字の表", rule: "規則" };
  const isHost = $derived(room.players.some((player) => player.id === ui.myPlayerId && player.isHost));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="debrief beb-stage-radial">
  <StageTimer deadline={undefined} label={stageLabels[STAGES.debrief]} />

  <div class="body">
    {#if result}
      <section class="headline" data-testid="outcome" data-outcome={result.outcome}>
        <p class="outcome">{result.outcome === "escaped" ? "ESCAPED!" : "TIME UP"}</p>
        <p class="rank" data-testid="rank">RANK {result.rank}</p>
        <p class="stats">
          開けた錠 {result.openedCount} / {result.locks.length} ／ ヒント {result.hintCount}回 ／ まちがい {result.wrongCount}回
        </p>
      </section>

      {#each result.locks as lock (lock.index)}
        <section class="lock" data-testid="lock-solution">
          <h2>
            <span class="en">{lock.labelEn}</span>
            <span class="state">{lock.opened ? "OPEN" : "LOCKED"}</span>
          </h2>
          <p class="code">答え <strong>{lock.code}</strong></p>

          <div class="row">
            {#each lock.order as symbol, index (index)}
              <SymbolIcon {symbol} size={34} />
            {/each}
          </div>

          {#if lock.rules.length > 0}
            <ol class="rules">
              {#each lock.rules as rule, index (index)}
                <li><span class="en">{rule.textEn}</span><span class="ja">{rule.textJa}</span></li>
              {/each}
            </ol>
          {/if}

          <ul class="map">
            {#each lock.map as entry (entry.symbol)}
              <li><SymbolIcon symbol={entry.symbol} size={24} /><span>{entry.digit}</span></li>
            {/each}
          </ul>

          <ul class="holders">
            {#each lock.holders as holder (holder.playerId)}
              <li>
                <span class="face" style={`background:${faceColor(holder.playerId)}`}>
                  <span aria-hidden="true">{playerIconOf(holder.playerId)}</span>
                </span>
                <span>{nameOf(holder.playerId)}</span>
                <span class="kinds">{holder.kinds.map((kind) => KIND_LABELS[kind]).join("・")}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    {:else}
      <p class="waiting">結果を受け取っています…</p>
    {/if}

    {#if isHost}
      <button class="beb-btn yellow" onclick={() => sendCommon({ type: "nextGame" })} data-testid="back-to-lobby">
        <span>ロビーへ戻る</span>
      </button>
    {:else}
      <p class="waiting" data-testid="waiting-host">ホストがロビーへ戻します。</p>
    {/if}
    <button class="beb-btn ghost leave" onclick={onLeave} data-testid="leave-room"><span>部屋を出る</span></button>
  </div>
</main>

<style>
  .debrief {
    min-height: 100vh;
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .headline {
    text-align: center;
    margin: 0 0 1rem;
  }
  .outcome {
    margin: 0;
    font-family: var(--font-display);
    font-size: 2.2rem;
    color: var(--yellow);
    transform: skew(var(--skew-angle));
  }
  .rank {
    margin: 0.2rem 0 0;
    font-family: var(--font-display);
    font-size: 1.4rem;
  }
  .stats {
    margin: 0.3rem 0 0;
    font-size: 0.78rem;
    color: var(--mist);
  }
  .lock {
    background: var(--ground-2);
    border-radius: var(--radius-card);
    padding: 0.7rem 0.8rem;
    margin: 0 0 0.8rem;
  }
  h2 {
    margin: 0 0 0.3rem;
    display: flex;
    justify-content: space-between;
    font-family: var(--font-display);
    font-size: 1rem;
  }
  h2 .state {
    font-size: 0.8rem;
    color: var(--yellow);
  }
  .code {
    margin: 0 0 0.4rem;
    font-size: 0.82rem;
  }
  .code strong {
    font-family: var(--font-display);
    font-size: 1.2rem;
    letter-spacing: 0.15em;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0 0 0.4rem;
  }
  .rules {
    margin: 0 0 0.4rem;
    padding-left: 1.2rem;
    font-size: 0.82rem;
  }
  .rules .ja {
    display: block;
    font-size: 0.7rem;
    color: var(--mist);
  }
  .map,
  .holders {
    list-style: none;
    margin: 0 0 0.4rem;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.6rem;
    font-size: 0.8rem;
  }
  .map li,
  .holders li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .face {
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 0.8rem;
  }
  .kinds {
    color: var(--mist);
    font-size: 0.7rem;
  }
  .waiting {
    margin: 0.6rem 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
  }
  .leave {
    margin-top: 0.5rem;
  }
</style>
