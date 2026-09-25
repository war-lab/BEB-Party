<!--
  解錠（基本設計/13のステージ）。

  自分の断片を上半分に、答えの入力を下半分に置く。断片を見ながら入力できるようにする。
  答えの照合・錠の切り替え・ヒントの開示はサーバが行い、ここは描画と入力の送信だけを持つ。

  提出の結果が状態として返るまで入力を無効にする。連打すると流量制限（10秒に20通。ADR-0017）に触れ、
  以降の提出が落ちる（13のsubmit）。
-->
<script lang="ts">
  import { acquireWakeLock, faceColor, playerIconOf, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    LOCK_COUNT,
    STAGES,
    currentLockOf,
    hintCountOf,
    type EscapeCallPublic,
    type EscapeCallSecret,
    type PieceKind,
  } from "@beb/shared-escapecall";
  import Glossary from "./Glossary.svelte";
  import PieceView from "./PieceView.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: EscapeCallPublic;
    secret: EscapeCallSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const KIND_LABELS: Record<PieceKind, string> = { order: "錠の記号", map: "数字の表", rule: "規則" };

  const lock = $derived(currentLockOf(publicState));
  const lockIndex = $derived(publicState.currentLockIndex);
  // 前の錠の断片が残っているあいだは描かない。錠が開いた直後に古い断片で入力させない
  const pieces = $derived(secret !== null && secret.lockIndex === lockIndex ? secret.pieces : []);
  const isHost = $derived(room.players.some((player) => player.id === ui.myPlayerId && player.isHost));
  const hintsHere = $derived(publicState.hints.filter((hint) => hint.lockIndex === lockIndex));
  const hintsLeft = $derived(lock ? lock.codeLength - 1 - hintCountOf(publicState, lockIndex) : 0);
  const attemptsHere = $derived(
    publicState.attempts.filter((attempt) => attempt.lockIndex === lockIndex).slice().reverse(),
  );

  let input = $state("");
  let pending = $state(false);
  let showGlossary = $state(false);
  let unlockedFlash = $state(false);
  // ヒントは押すたびにランクが下がる。返るまで押せなくし、連打で2桁開く経路を塞ぐ
  let hintPending = $state(false);
  let lastHintCount = -1;
  let lastAttemptCount = -1;
  let lastLockIndex = -1;

  $effect(() => acquireWakeLock());

  // 提出の結果が状態として返ったら入力を戻す。錠が進んだときは解錠の演出を挟む
  $effect(() => {
    const count = publicState.attempts.length;
    const index = publicState.currentLockIndex;
    if (lastLockIndex !== -1 && index !== lastLockIndex) {
      unlockedFlash = true;
      setTimeout(() => (unlockedFlash = false), 1400);
      input = "";
    }
    if (count !== lastAttemptCount || index !== lastLockIndex) {
      pending = false;
    }
    lastAttemptCount = count;
    lastLockIndex = index;
  });

  $effect(() => {
    const count = publicState.hints.length;
    if (count !== lastHintCount) {
      hintPending = false;
    }
    lastHintCount = count;
  });

  // サーバが拒否した場合（already_attempted 等）も入力を戻す
  $effect(() => {
    if (ui.lastErrorCode !== null) {
      pending = false;
      hintPending = false;
    }
  });

  function requestHint(): void {
    if (hintPending || hintsLeft <= 0) {
      return;
    }
    ui.lastErrorCode = null;
    hintPending = sendAction(ACTIONS.hint);
  }

  function press(digit: string): void {
    if (lock && input.length < lock.codeLength && !pending) {
      input += digit;
    }
  }

  function erase(): void {
    input = input.slice(0, -1);
  }

  function submit(): void {
    if (!lock || input.length !== lock.codeLength || pending) {
      return;
    }
    ui.lastErrorCode = null;
    pending = sendAction(ACTIONS.submit, { code: input });
    if (pending) {
      input = "";
    }
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function hintDigitAt(position: number): string | undefined {
    return hintsHere.find((hint) => hint.position === position)?.digit;
  }
</script>

<main class="solving">
  <StageTimer
    deadline={room.deadline}
    label={`${stageLabels[STAGES.solving]} ${Math.min(lockIndex + 1, LOCK_COUNT)} / ${LOCK_COUNT}`}
  />

  {#if unlockedFlash}
    <div class="unlocked beb-zoom-in" data-testid="unlocked" aria-live="polite">UNLOCKED!</div>
  {/if}

  <div class="body">
    {#if lock}
      <section class="lock" data-testid="lock">
        <p class="label"><span class="en">{lock.labelEn}</span><span class="ja">{lock.labelJa}</span></p>
        <ol class="slots" aria-label="答えの桁">
          {#each Array.from({ length: lock.codeLength }, (_, index) => index) as position (position)}
            <li class:hinted={hintDigitAt(position) !== undefined}>
              {input[position] ?? hintDigitAt(position) ?? ""}
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    <section class="mine" data-testid="my-pieces">
      <h2>あなたの手がかり</h2>
      {#each pieces as piece, index (index)}
        <PieceView {piece} />
      {:else}
        <p class="empty">手がかりを受け取っています…</p>
      {/each}
      <button class="glossary-toggle" onclick={() => (showGlossary = !showGlossary)} data-testid="glossary-toggle">
        {showGlossary ? "色と形の言い方をとじる" : "色と形の言い方"}
      </button>
      {#if showGlossary}
        <Glossary />
      {/if}
    </section>

    <section class="holders">
      <h2>だれが何を持っている？</h2>
      <ul>
        {#each publicState.holders as holder (holder.playerId)}
          <li>
            <span class="face" style={`background:${faceColor(holder.playerId)}`}>
              <span aria-hidden="true">{playerIconOf(holder.playerId)}</span>
            </span>
            <span class="name">{nameOf(holder.playerId)}</span>
            <span class="kinds">{holder.kinds.map((kind) => KIND_LABELS[kind]).join("・")}</span>
          </li>
        {/each}
      </ul>
    </section>

    <section class="keypad" data-testid="keypad">
      <div class="keys">
        {#each ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as digit (digit)}
          <button onclick={() => press(digit)} disabled={pending} data-testid={`key-${digit}`}>{digit}</button>
        {/each}
        <button class="erase" onclick={erase} disabled={pending || input.length === 0} data-testid="key-erase">←</button>
        <button onclick={() => press("0")} disabled={pending} data-testid="key-0">0</button>
        <button
          class="enter"
          onclick={submit}
          disabled={pending || !lock || input.length !== lock.codeLength}
          data-testid="submit"
        >
          {pending ? "…" : "OPEN"}
        </button>
      </div>
      {#if ui.lastErrorCode === "already_attempted"}
        <p class="error" data-testid="submit-error">その答えはもう試しています。</p>
      {/if}
    </section>

    {#if attemptsHere.length > 0}
      <section class="attempts">
        <h2>ためした答え</h2>
        <ul>
          {#each attemptsHere as attempt, index (index)}
            <li data-testid="attempt" class:ok={attempt.accepted}>
              <span class="code">{attempt.code}</span>
              <span class="who">{nameOf(attempt.playerId)}</span>
              <span class="mark">{attempt.accepted ? "OPEN" : "×"}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if isHost}
      <section class="hint">
        <button
          class="beb-btn ghost"
          onclick={requestHint}
          disabled={hintPending || hintsLeft <= 0}
          data-testid="hint"
        >
          <span>ヒント：1桁あける（のこり{Math.max(hintsLeft, 0)}）</span>
        </button>
        <p class="note">みんなで相談してから押してください。ヒントを使うとランクが下がります。</p>
      </section>
    {/if}
  </div>
</main>

<style>
  .solving {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.8rem 1rem 1.4rem;
  }
  h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .unlocked {
    position: fixed;
    inset: 40% 0 auto;
    z-index: 20;
    text-align: center;
    font-family: var(--font-display);
    font-size: 2.4rem;
    color: var(--ink);
    background: var(--yellow);
    padding: 0.6rem 0;
    transform: skew(var(--skew-angle));
    box-shadow: var(--shadow-hard);
  }
  .lock {
    margin: 0 0 0.8rem;
  }
  .label {
    margin: 0 0 0.4rem;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .label .en {
    font-family: var(--font-display);
    font-size: 1.15rem;
  }
  .label .ja {
    font-size: 0.72rem;
    color: var(--mist);
  }
  .slots {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0.35rem;
  }
  .slots li {
    width: 2.6rem;
    height: 3rem;
    display: grid;
    place-items: center;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-tile);
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
  }
  .slots li.hinted {
    background: var(--yellow);
  }
  .mine,
  .holders,
  .keypad,
  .attempts,
  .hint {
    margin: 0 0 0.9rem;
  }
  .empty {
    margin: 0;
    font-size: 0.82rem;
    color: var(--mist);
  }
  .glossary-toggle {
    margin: 0 0 0.4rem;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: var(--radius-button);
    color: var(--mist);
    font-size: 0.74rem;
    padding: 0.2rem 0.7rem;
    cursor: pointer;
  }
  .holders ul,
  .attempts ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .holders li {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.82rem;
  }
  .face {
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 0.95rem;
    flex: none;
  }
  .kinds {
    margin-left: auto;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .keys {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
  }
  .keys button {
    height: 3rem;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-tile);
    font-family: var(--font-display);
    font-size: 1.35rem;
    box-shadow: var(--shadow-tile);
    cursor: pointer;
  }
  .keys button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .keys .enter {
    background: var(--yellow);
    font-size: 1rem;
  }
  .keys .erase {
    background: var(--ground-2);
    color: var(--panel);
  }
  .error {
    margin: 0.4rem 0 0;
    font-size: 0.78rem;
    color: var(--yellow);
  }
  .attempts li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.82rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    padding-bottom: 0.2rem;
  }
  .attempts .code {
    font-family: var(--font-display);
    letter-spacing: 0.12em;
    font-variant-numeric: tabular-nums;
  }
  .attempts .who {
    color: var(--mist);
    font-size: 0.72rem;
  }
  .attempts .mark {
    margin-left: auto;
    color: var(--mist);
  }
  .attempts li.ok .mark {
    color: var(--yellow);
  }
  .note {
    margin: 0.35rem 0 0;
    font-size: 0.7rem;
    color: var(--mist);
  }
</style>
