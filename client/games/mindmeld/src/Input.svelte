<!--
  語を出す（基本設計/15のステージと画面）。

  お題、ラウンドと試行の番号、自分のペアの前の試行の2語、使用済みの語、語の入力、提出状況を出す。
  入力欄は、表示形の条件を満たさない語と使用済みの語を送信させない。判定はサーバと同じ関数を使う。
  語を出さない人（一致済みのペアと、休む3人組の1人）には「今回は待つ」と出し、他のペアの提出状況を見せる。
  提出した語は公開状態に載らない。自分の語は秘密情報で受け取り、番号が一致するときだけ出す。
-->
<script lang="ts">
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { untrack } from "svelte";
  import {
    ACTIONS,
    ERROR_CODES,
    STAGES,
    WORD_INPUT_MAX_CHARS,
    checkWord,
    isFinalRound,
    type MindMeldPublic,
    type MindMeldSecret,
    type WordProblem,
  } from "@beb/shared-mindmeld";
  import PromptCard from "./PromptCard.svelte";
  import TeamChip from "./TeamChip.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: MindMeldPublic;
    secret: MindMeldSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const myId = $derived(ui.myPlayerId);
  const myLevel = $derived(room.players.find((player) => player.id === myId)?.level ?? 1);
  const myTeam = $derived(publicState.teams.find((team) => myId !== null && team.memberIds.includes(myId)));
  const isActive = $derived(myId !== null && publicState.activePlayerIds.includes(myId));
  const hasSubmitted = $derived(myId !== null && publicState.submittedPlayerIds.includes(myId));
  const attemptKey = $derived(`${publicState.roundIndex}:${publicState.attemptIndex}`);
  // 前の試行の秘密を、いまの試行の提出として出さない（15の秘密情報）
  const mine = $derived(
    secret !== null && secret.roundIndex === publicState.roundIndex && secret.attemptIndex === publicState.attemptIndex
      ? secret
      : null,
  );
  const myTeamMatched = $derived(
    myTeam !== undefined &&
      publicState.attempts.some((attempt) =>
        attempt.teams.some((entry) => entry.teamId === myTeam.id && entry.matched === true),
      ),
  );
  // 自分のチームの前の試行の2語。つなぎの1語を考える材料であり、入力欄の上に大きく出す
  const previous = $derived.by(() => {
    const last = publicState.attempts[publicState.attempts.length - 1];
    return last?.teams.find((entry) => entry.teamId === myTeam?.id) ?? null;
  });
  const label = $derived(
    `${stageLabels[STAGES.input]} お題${publicState.roundIndex + 1}/${publicState.maxRounds}・${publicState.attemptIndex + 1}回目`,
  );

  // 入力中の値はローカルに持つ。stateの受信で消えないようにする（基本設計/02のストア設計と同じ理由）
  let draft = $state("");
  let draftFor = "";
  let restored = false;
  let lastSent = $state<string | null>(null);
  $effect(() => {
    const key = attemptKey;
    const word = mine?.word;
    // 試行が変わったら入力を空へ戻す。再接続後は自分の提出を1回だけ初期値に入れる
    untrack(() => {
      if (draftFor !== key) {
        draftFor = key;
        draft = word ?? "";
        lastSent = null;
        restored = word !== undefined;
      } else if (!restored && word !== undefined && draft === "") {
        draft = word;
        restored = true;
      }
    });
  });

  const checked = $derived(checkWord(draft));
  const used = $derived(checked.ok && publicState.usedKeys.includes(checked.key));
  const canSubmit = $derived(isActive && checked.ok && !used);

  const PROBLEM_TEXT: Record<WordProblem, string> = {
    empty: "英単語を1つ入れてください。",
    letters: "英字だけで書いてください（かな・数字は使えません）。",
    parts: "2語までです（ice cream のような語は使えます）。",
    length: "24文字までです。",
    key_length: "2文字以上の語にしてください。",
  };
  const serverRejected = $derived(
    lastSent === draft && (ui.lastErrorCode === ERROR_CODES.usedWord || ui.lastErrorCode === ERROR_CODES.invalidWord),
  );

  function submit(): void {
    if (!canSubmit) {
      return;
    }
    ui.lastErrorCode = null;
    if (
      sendAction(ACTIONS.submit, {
        roundIndex: publicState.roundIndex,
        attemptIndex: publicState.attemptIndex,
        word: draft,
      })
    ) {
      lastSent = draft;
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    // 1語の入力であり、Enterでの送信を許す。変換確定のEnterは送らない
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="input">
  <StageTimer deadline={room.deadline} {label} />

  <div class="body">
    {#if isFinalRound(publicState)}<p class="final" data-testid="final-round">最後のお題</p>{/if}

    {#if publicState.prompt}
      <PromptCard prompt={publicState.prompt} {myLevel} />
    {/if}

    {#if isActive}
      <p class="guide" data-testid="stage-guide">
        {publicState.attemptIndex === 0
          ? "お題に合う英単語を1つ出します。語や手がかりは口に出さないでください。"
          : "前の2語の両方につながる英単語を1つ出します。語や手がかりは口に出さないでください。"}
      </p>
    {/if}

    {#if previous}
      <section class="previous" data-testid="previous-words">
        <h2>前の2語</h2>
        <p class="pair">
          {#each previous.words as entry, index (entry.playerId)}
            {#if index > 0}<span class="plus" aria-hidden="true">+</span>{/if}
            <span class="word" class:none={entry.word === null}>{entry.word ?? "（なし）"}</span>
          {/each}
        </p>
      </section>
    {/if}

    {#if isActive}
      <label class="entry">
        <span class="label">英単語を1つ</span>
        <input
          data-testid="word-input"
          type="text"
          bind:value={draft}
          maxlength={WORD_INPUT_MAX_CHARS}
          onkeydown={onKeydown}
          autocapitalize="none"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="send"
          placeholder="例: cook"
        />
      </label>

      <button class="beb-btn yellow" data-testid="submit-word" disabled={!canSubmit} onclick={submit}>
        <span>{hasSubmitted ? "出し直す" : "この語で出す"}</span>
      </button>

      {#if draft.trim() !== "" && !checked.ok}
        <p class="hint warn" data-testid="word-problem">{PROBLEM_TEXT[checked.problem]}</p>
      {:else if used}
        <p class="hint warn" data-testid="used-hint">このお題ではもう出た語です。</p>
      {:else if serverRejected}
        <p class="hint warn" data-testid="rejected-hint">この語は出せません。別の語にしてください。</p>
      {:else if hasSubmitted}
        <p class="hint" data-testid="submitted-hint">
          出しました{mine?.word ? `（${mine.word}）` : ""}。締切まで出し直せます。
        </p>
      {/if}
    {:else}
      <p class="rest" data-testid="waiting-turn">
        {myTeamMatched ? "今回は待つ。あなたのチームはこのお題でそろいました。" : "今回は待つ。この回はチームのほかの2人が語を出します。"}
      </p>
    {/if}

    {#if publicState.usedKeys.length > 0}
      <section class="used" data-testid="used-words">
        <h2>このお題で出せない語</h2>
        <ul>
          {#each publicState.usedKeys as key (key)}
            <li>{key}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="status" data-testid="submit-status">
      <h2>提出</h2>
      <ul>
        {#each publicState.teams as team (team.id)}
          {@const speakers = publicState.activePlayerIds.filter((playerId) => team.memberIds.includes(playerId))}
          <li>
            <TeamChip {team} {nameOf} restingIds={team.memberIds.filter((playerId) => !speakers.includes(playerId))} />
            {#if speakers.length === 0}
              <span class="state">そろった</span>
            {:else}
              <span class="state" data-testid="team-submitted">
                {speakers.filter((playerId) => publicState.submittedPlayerIds.includes(playerId)).length} / {speakers.length}
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  </div>
</main>

<style>
  .input {
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
  .guide {
    margin: 0 0 0.7rem;
    background: var(--ground-2);
    border: var(--outline-width) solid var(--yellow);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
    font-size: 0.82rem;
    line-height: 1.5;
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
  .previous .pair {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }
  .previous .word {
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.3rem 0.7rem;
    font-size: 1.5rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .previous .word.none {
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .plus {
    font-family: var(--font-display);
    color: var(--mist);
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
  input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-tile);
    padding: 0.6rem;
    font-family: var(--font-body);
    font-size: 1.2rem;
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
  .rest {
    margin: 0 0 0.9rem;
    background: var(--ground-2);
    border: var(--outline-width) solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.6rem 0.7rem;
    font-size: 0.9rem;
    font-weight: 700;
    text-align: center;
  }
  .used ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .used li {
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.1rem 0.45rem;
    font-size: 0.76rem;
    color: var(--mist);
  }
  .status ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .status li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.55rem;
  }
  .state {
    flex: none;
    font-size: 0.8rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--mist);
  }
</style>
