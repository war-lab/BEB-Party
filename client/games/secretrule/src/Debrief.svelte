<!--
  結果（基本設計/14の結果と画面）。

  正解しなかった卓にも秘密の規則を出す。どこで推理が外れたかを振り返れるようにするためである。
  英文が通った理由（照合語の分解や語数）は添えない。読み比べる工程を画面が代わらないためである。
  finishedのまま再接続した人へは共通コアが lastResult を再送するため、公開状態に依存しない。
  ロビーへ戻す操作は nextGame の送信だけとする。切断はしない。
-->
<script lang="ts">
  import { faceColor, playerIconOf, sendCommon, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { MAX_ROUNDS, STAGES, type SecretRuleResult } from "@beb/shared-secretrule";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    result: SecretRuleResult | null;
    onLeave: () => void;
  }
  let { room, result, onLeave }: Props = $props();

  const isHost = $derived(room.players.some((player) => player.id === ui.myPlayerId && player.isHost));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function numberOf(candidateId: string): number {
    return (result?.candidates.findIndex((entry) => entry.id === candidateId) ?? -1) + 1;
  }

  const rounds = $derived(
    result === null ? [] : Array.from({ length: MAX_ROUNDS }, (_, index) => index).filter((round) =>
      result.tested.some((entry) => entry.roundIndex === round) || result.answers.some((answer) => answer.roundIndex === round),
    ),
  );
</script>

<main class="debrief beb-stage-radial">
  <StageTimer deadline={undefined} label={stageLabels[STAGES.debrief]} />

  <div class="body">
    {#if result}
      <section class="headline" data-testid="outcome" data-outcome={result.outcome}>
        <p class="outcome">{result.outcome === "solved" ? "SOLVED!" : "NOT SOLVED"}</p>
        <p class="rank" data-testid="rank">RANK {result.rank}</p>
        <p class="stats">
          {result.solvedRound === null ? "正解できなかった" : `${result.solvedRound}ラウンド目で正解`} ／ まちがい {result.wrongCount}回
          {#if result.outcome === "solved"} ／ 最後の英文 {result.proofPassedCount} / {result.playerCount}人が通過{/if}
        </p>
      </section>

      <section class="rule" data-testid="secret-rule">
        <h2>秘密の規則（{numberOf(result.rule.id)}番）</h2>
        <p class="en">{result.rule.textEn}</p>
        <p class="ja">{result.rule.textJa}</p>
      </section>

      {#each rounds as round (round)}
        <section class="round" data-testid="round-record">
          <h2>ラウンド {round + 1}</h2>
          <ul>
            {#each result.tested.filter((entry) => entry.roundIndex === round) as entry (entry.playerId)}
              <li>
                <span class="face" style={`background:${faceColor(entry.playerId)}`}>
                  <span aria-hidden="true">{playerIconOf(entry.playerId)}</span>
                </span>
                <span class="text">
                  <span class="name">{nameOf(entry.playerId)}</span>
                  <span>{entry.text}</span>
                </span>
                <span class="verdict" class:pass={entry.passed}>{entry.passed ? "○ 通過" : "× 不通過"}</span>
              </li>
            {/each}
          </ul>
          {#each result.answers.filter((answer) => answer.roundIndex === round) as answer (answer.candidateId)}
            <p class="answer" class:correct={answer.correct}>
              答え: {numberOf(answer.candidateId)}番 → {answer.correct ? "正解" : "ちがった"}
            </p>
          {/each}
        </section>
      {/each}

      {#if result.outcome === "solved"}
        <section class="proof" data-testid="proof-record">
          <h2>最後の英文</h2>
          <p class="cond">満たす: {result.rule.textEn} ／ 満たさない: {result.avoid.textEn}</p>
          <ul>
            {#each result.proofEntries as entry (entry.playerId)}
              <li>
                <span class="face" style={`background:${faceColor(entry.playerId)}`}>
                  <span aria-hidden="true">{playerIconOf(entry.playerId)}</span>
                </span>
                <span class="text">
                  <span class="name">{nameOf(entry.playerId)}</span>
                  <span>{entry.text}</span>
                </span>
                <span class="verdict" class:pass={entry.passed}>{entry.passed ? "○ 通過" : "× 不通過"}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
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
    margin: 0.2rem 0;
    font-family: var(--font-display);
    font-size: 1.4rem;
  }
  .stats {
    margin: 0;
    font-size: 0.8rem;
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
  .rule {
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 0.6rem 0.75rem;
  }
  .rule h2 {
    color: var(--ink);
  }
  .rule .en {
    margin: 0;
    font-size: 1.05rem;
  }
  .rule .ja {
    margin: 0.15rem 0 0;
    font-size: 0.76rem;
    color: var(--ink-soft);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.5rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.55rem;
  }
  .face {
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .text {
    display: grid;
    font-size: 0.9rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .name {
    font-size: 0.7rem;
    color: var(--mist);
  }
  .verdict {
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: var(--radius-tile);
    padding: 0.1rem 0.45rem;
    background: var(--panel);
    color: var(--ink);
    white-space: nowrap;
  }
  .verdict.pass {
    background: var(--yellow);
  }
  .answer {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    color: var(--mist);
  }
  .answer.correct {
    color: var(--yellow);
    font-weight: 700;
  }
  .cond {
    margin: 0 0 0.35rem;
    font-size: 0.76rem;
    color: var(--mist);
  }
  .waiting {
    margin: 0.6rem 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
  }
  .leave {
    margin-top: 0.6rem;
  }
</style>
