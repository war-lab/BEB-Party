<!--
  英文の入力。writing（下書き）と proving（規則を使って書く）で共用する（基本設計/14のステージと画面）。

  入力の規則は3つ。Enterで送信しない、上限で入力を止める、下限を満たすまで送信させない。
  文字数は入力したままの文字列で数えて止める。正規化の前に止めるのは、空白の多い入力で
  ペイロードが ACTION_MAX_CHARS を超える経路を作らないためである（14の画面）。
  語数は正規化後に数える。サーバの判定と同じ関数を使う。
-->
<script lang="ts">
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    ERROR_CODES,
    MAX_CHARS,
    MIN_WORDS,
    STAGES,
    STARTER_BLANK,
    countChars,
    countWords,
    isFinalRound,
    normalizeSubmission,
    type SecretRulePublic,
    type SecretRuleSecret,
  } from "@beb/shared-secretrule";
  import CandidateList from "./CandidateList.svelte";
  import History from "./History.svelte";
  import KeyExpressions from "./KeyExpressions.svelte";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: SecretRulePublic;
    secret: SecretRuleSecret | null;
    mode: "writing" | "proving";
  }
  let { room, publicState, secret, mode }: Props = $props();

  const myLevel = $derived(room.players.find((player) => player.id === ui.myPlayerId)?.level ?? 1);
  const phase = $derived(mode === "writing" ? "writing" : "proving");
  // 送り直された秘密が今のステージのものかを確かめてから使う
  const mine = $derived(secret?.phase === phase && secret.roundIndex === publicState.roundIndex ? secret : null);
  const hasSubmitted = $derived(ui.myPlayerId !== null && publicState.submittedPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
  const label = $derived(
    mode === "writing"
      ? `${stageLabels[STAGES.writing]} ${publicState.roundIndex + 1} / ${publicState.maxRounds}`
      : stageLabels[STAGES.proving],
  );
  const finalRound = $derived(mode === "writing" && isFinalRound(publicState));
  const eliminatedIds = $derived(
    publicState.answers.filter((answer) => !answer.correct).map((answer) => answer.candidateId),
  );
  const ruleCandidate = $derived(publicState.candidates.find((entry) => entry.id === publicState.solvedCandidateId));
  const avoidCandidate = $derived(publicState.candidates.find((entry) => entry.id === publicState.avoidCandidateId));

  // 入力中の値はローカルに持つ。stateの受信で消えないようにする（基本設計/02のストア設計と同じ理由）
  let draft = $state("");
  // 再接続後は自分の提出を初期値に入れる。手元に書きかけがあれば手元を残す
  let restoredFor = $state<string | null>(null);
  $effect(() => {
    const key = `${phase}:${publicState.roundIndex}`;
    const submitted = mine?.draft;
    if (submitted !== undefined && restoredFor !== key && draft === "") {
      draft = submitted;
      restoredFor = key;
    }
  });

  let lastSent = $state<string | null>(null);
  const normalized = $derived(normalizeSubmission(draft));
  const words = $derived(countWords(normalized));
  const remaining = $derived(MAX_CHARS - countChars(draft));
  const canSubmit = $derived(words >= MIN_WORDS && countChars(normalized) <= MAX_CHARS);
  // 重複の拒否はサーバだけが判定する（比較キーはサーバの照合語で作る）
  const duplicate = $derived(lastSent === draft && ui.lastErrorCode === ERROR_CODES.duplicate);

  function submit(): void {
    if (!canSubmit) {
      return;
    }
    ui.lastErrorCode = null;
    if (sendAction(ACTIONS.submit, { text: draft })) {
      lastSent = draft;
    }
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="compose">
  <StageTimer deadline={room.deadline} label={label} />

  <div class="body">
    <StageGuide step={mode} />
    {#if finalRound}<p class="final" data-testid="final-round">最後のラウンド</p>{/if}

    {#if mode === "proving" && ruleCandidate && avoidCandidate}
      <section class="target" data-testid="proving-target">
        <p class="row"><span class="tag">満たす</span><span class="en">{ruleCandidate.textEn}</span></p>
        <p class="ja">{ruleCandidate.textJa}</p>
        <p class="row"><span class="tag avoid">満たさない</span><span class="en">{avoidCandidate.textEn}</span></p>
        <p class="ja">{avoidCandidate.textJa}</p>
        <p class="note" data-testid="avoid-note">「満たさない」の条件は守らずに書きます。例えば「e の文字を使わない」なら、e を使った英文にします。</p>
      </section>
    {/if}

    <label class="entry">
      <span class="label">{mode === "writing" ? "英語で1文（下書き）" : "英語で1文"}</span>
      <!-- maxlengthで上限を止める。Enterは送信に割り当てない（誤送信を防ぐ） -->
      <textarea
        data-testid="submission-input"
        bind:value={draft}
        maxlength={MAX_CHARS}
        rows="3"
        placeholder={publicState.starters[0]?.en ?? `My favorite food is ${STARTER_BLANK}`}
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

    {#if duplicate}
      <p class="hint warn" data-testid="duplicate-hint">同じ英文がすでに出ています。少し変えて出してください。</p>
    {:else if words < MIN_WORDS}
      <p class="hint" data-testid="too-short-hint">{MIN_WORDS}語以上で書いてください。</p>
    {:else if hasSubmitted}
      <p class="hint" data-testid="submitted-hint">
        {mode === "writing" ? "出しました。締切まで書き直せます。" : "出しました。結果は最後にまとめて出ます。"}
      </p>
    {/if}

    {#if mode === "writing"}
      <details class="starters" open={myLevel <= 2} data-testid="starters">
        <summary>書き出しの例</summary>
        <p class="note">{STARTER_BLANK} は自分の言葉に置き換えてください。</p>
        <ul>
          {#each publicState.starters as starter (starter.en)}
            <li><span class="en">{starter.en}</span><span class="ja">{starter.ja}</span></li>
          {/each}
        </ul>
      </details>

      <KeyExpressions expressions={publicState.keyExpressions} {myLevel} />
      <CandidateList candidates={publicState.candidates} {myLevel} {eliminatedIds} />
      <History
        entries={publicState.entries}
        results={secret?.results ?? []}
        myPlayerId={ui.myPlayerId}
        {nameOf}
      />
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
  .compose {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .final {
    margin: 0 0 0.6rem;
    text-align: center;
    font-family: var(--font-display);
    color: var(--yellow);
  }
  .target {
    margin: 0 0 0.8rem;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 0.6rem 0.75rem;
  }
  .target .row {
    margin: 0.2rem 0 0;
    display: flex;
    gap: 0.45rem;
    align-items: baseline;
  }
  .target .en {
    font-size: 0.95rem;
  }
  .target .ja {
    margin: 0 0 0.3rem;
    font-size: 0.74rem;
    color: var(--ink-soft);
  }
  .target .note {
    margin: 0.35rem 0 0;
    font-size: 0.74rem;
    color: var(--ink-soft);
  }
  .tag {
    flex: none;
    font-size: 0.68rem;
    font-weight: 700;
    background: var(--yellow);
    color: var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.05rem 0.4rem;
  }
  .tag.avoid {
    background: var(--ink-soft);
    color: var(--panel);
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
    margin: 0.5rem 0 0.8rem;
    font-size: 0.78rem;
    color: var(--mist);
  }
  .hint.warn {
    color: var(--yellow);
    font-weight: 700;
  }
  .starters {
    margin: 0.4rem 0 0.9rem;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
  }
  .starters summary {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .starters .note {
    margin: 0.35rem 0;
    font-size: 0.72rem;
    color: var(--mist);
  }
  .starters ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .starters li {
    display: grid;
    font-size: 0.9rem;
  }
  .starters .ja {
    font-size: 0.72rem;
    color: var(--mist);
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
