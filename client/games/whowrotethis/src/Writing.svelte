<!--
  英作文（基本設計/11のステージ、基本設計/02の「英文の入力」）。

  入力の規則は3つ。Enterで送信しない、上限で入力を止める、下限を満たすまで送信させない。
  サーバの拒否（too_short / too_long）を通常の操作で踏ませないためである。
  入力欄と送信ボタンは同じスクロール領域に置く（下部固定はソフトキーボードに隠れる端末がある）。
-->
<script lang="ts">
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    HINT_BLANK,
    MAX_CHARS,
    MIN_WORDS,
    STAGES,
    countChars,
    countWords,
    normalizeSubmission,
    type WhoWroteThisPublic,
    type WhoWroteThisSecret,
  } from "@beb/shared-whowrotethis";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: WhoWroteThisPublic;
    secret: WhoWroteThisSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const roundLabel = $derived(`${publicState.roundIndex + 1} / ${publicState.totalRounds}`);
  const mine = $derived(secret?.roundIndex === publicState.roundIndex ? secret : null);
  const hasSubmitted = $derived(ui.myPlayerId !== null && publicState.submittedPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);

  // 入力中の値はローカルに持つ。stateの受信で消えないようにする（基本設計/02のストア設計と同じ理由）
  let draft = $state("");
  // 再接続後は自分の提出を初期値に入れる。届いた提出と手元の下書きが違う場合は手元を残す
  let restoredFor = $state<number | null>(null);
  $effect(() => {
    const submission = mine?.submission;
    if (submission !== undefined && restoredFor !== publicState.roundIndex && draft === "") {
      draft = submission;
      restoredFor = publicState.roundIndex;
    }
  });

  // 入力欄の例は自分のhintの1件目から作る。質問ごとに変わり、常に的を射た例になる
  const placeholder = $derived(mine?.hintEn[0] ?? `I would ${HINT_BLANK}`);
  const normalized = $derived(normalizeSubmission(draft));
  const words = $derived(countWords(normalized));
  const remaining = $derived(MAX_CHARS - countChars(draft));
  const canSubmit = $derived(words >= MIN_WORDS && countChars(normalized) <= MAX_CHARS);

  function submit(): void {
    if (!canSubmit) {
      return;
    }
    sendAction(ACTIONS.submit, { text: draft });
  }
</script>

<main class="writing">
  <StageTimer deadline={room.deadline} label={`${stageLabels[STAGES.writing]} ${roundLabel}`} />

  <div class="body">
    <StageGuide step="writing" />

    <section class="question">
      <p class="q-en">{publicState.question.en}</p>
      <p class="q-ja">{publicState.question.ja}</p>
    </section>

    <label class="entry">
      <span class="label">英語で1文</span>
      <!-- maxlengthで上限を止める。Enterは送信に割り当てない（誤送信を防ぐ） -->
      <textarea
        data-testid="submission-input"
        bind:value={draft}
        maxlength={MAX_CHARS}
        rows="3"
        {placeholder}
        autocapitalize="sentences"
        autocomplete="off"
      ></textarea>
      <span class="meter" data-testid="submission-meter">
        <span class:short={words < MIN_WORDS}>{words}語</span>
        <span>のこり {remaining}文字</span>
      </span>
    </label>

    <button class="beb-btn yellow" data-testid="submit" disabled={!canSubmit} onclick={submit}>
      <span>{hasSubmitted ? "書き直して出す" : "この文で出す"}</span>
    </button>

    {#if words < MIN_WORDS}
      <p class="hint" data-testid="too-short-hint">{MIN_WORDS}語以上で書いてください。</p>
    {:else if hasSubmitted}
      <p class="hint" data-testid="submitted-hint">提出しました。締切まで書き直せます。</p>
    {/if}

    {#if mine && mine.hintEn.length > 0}
      <section class="hints" data-testid="my-hints">
        <h2>言い方の例</h2>
        <p class="note">{HINT_BLANK} は自分の言葉に置き換えてください。</p>
        <ul>
          {#each mine.hintEn as hint (hint)}
            <li>{hint}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <ul class="players" data-testid="submitted-list">
      {#each room.players as player (player.id)}
        <li class:done={publicState.submittedPlayerIds.includes(player.id)}>{player.name}</li>
      {/each}
    </ul>

    <p class="waiting" data-testid="submitted-count">
      ていしゅつ {publicState.submittedPlayerIds.length} / {connectedCount}
    </p>
  </div>
</main>

<style>
  .writing {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .question {
    margin: 0 0 0.8rem;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 0.7rem 0.8rem;
  }
  .q-en {
    margin: 0 0 0.2rem;
    font-family: var(--font-display);
    font-size: 1.15rem;
    line-height: 1.25;
  }
  .q-ja {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .entry {
    display: block;
    margin: 0 0 0.7rem;
  }
  .label {
    display: block;
    margin: 0 0 0.3rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-tile);
    padding: 0.6rem;
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.5;
    resize: vertical;
  }
  .meter {
    display: flex;
    justify-content: space-between;
    margin-top: 0.25rem;
    font-size: 0.74rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
  .meter .short {
    color: var(--yellow);
  }
  .hint {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    color: var(--mist);
  }
  .hints {
    margin: 1rem 0 0.8rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.55rem 0.7rem;
  }
  .hints h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .hints ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .hints .note {
    margin: 0 0 0.35rem;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .hints li {
    font-size: 0.9rem;
    line-height: 1.4;
  }
  .players {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .players li {
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.2rem 0.5rem;
    font-size: 0.76rem;
    color: var(--mist);
    opacity: 0.55;
  }
  .players li.done {
    border-color: var(--yellow);
    color: var(--panel);
    opacity: 1;
  }
  .waiting {
    margin: 0.6rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
