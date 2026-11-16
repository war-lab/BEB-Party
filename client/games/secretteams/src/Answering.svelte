<!--
  相談と回答（基本設計/17のステージと画面）。

  自分の単語とテーマ、参加者の一覧（味方の選択）、選択肢6件（相手のテーマの選択）、言い回し、回答状況、残り時間を出す。
  味方は maxAllyPicks 人まで選べ、上限に達したら他の人を選ぶ前に選択を外させる。
  送信ボタンの近くに、味方を何人選んだかと相手のテーマを選んだかを出し、両方が揃うまで送信させない。
  回答は締切まで上書きできる。選択中の参加者と選択肢は背景の膜で示し、黄の輪郭は「いまやること」の案内だけに使う。
-->
<script lang="ts">
  import { acquireWakeLock, faceColor, playerIconOf, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { untrack } from "svelte";
  import {
    ACTIONS,
    STAGES,
    type SecretTeamsPublic,
    type SecretTeamsSecret,
  } from "@beb/shared-secretteams";
  import KeyExpressions from "./KeyExpressions.svelte";
  import MyCard from "./MyCard.svelte";
  import ThemeChoices from "./ThemeChoices.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: SecretTeamsPublic;
    secret: SecretTeamsSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const myId = $derived(ui.myPlayerId);
  const myLevel = $derived(room.players.find((player) => player.id === myId)?.level ?? 1);
  const others = $derived(room.players.filter((player) => player.id !== myId));
  const hasSubmitted = $derived(myId !== null && publicState.submittedPlayerIds.includes(myId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);

  // 選択中の回答はローカルに持つ。stateの受信で消えないようにする（基本設計/02のストア設計と同じ理由）
  let allyIds = $state<string[]>([]);
  let themeId = $state<string | null>(null);
  let restored = false;
  $effect(() => {
    const answer = secret?.answer;
    // 再接続後は自分の回答を1回だけ初期値に入れる
    untrack(() => {
      if (!restored && answer !== undefined) {
        allyIds = [...answer.allyIds];
        themeId = answer.opponentThemeId;
        restored = true;
      }
    });
  });

  const atLimit = $derived(allyIds.length >= publicState.maxAllyPicks);
  const canSubmit = $derived(allyIds.length > 0 && themeId !== null && themeId !== secret?.themeId);
  const sentMatches = $derived(
    secret?.answer !== undefined &&
      secret.answer.opponentThemeId === themeId &&
      secret.answer.allyIds.length === allyIds.length &&
      secret.answer.allyIds.every((id) => allyIds.includes(id)),
  );

  function toggleAlly(playerId: string): void {
    if (allyIds.includes(playerId)) {
      allyIds = allyIds.filter((id) => id !== playerId);
    } else if (!atLimit) {
      allyIds = [...allyIds, playerId];
    }
  }

  function submit(): void {
    if (!canSubmit || themeId === null) {
      return;
    }
    sendAction(ACTIONS.submit, { allyIds, opponentThemeId: themeId });
  }

  $effect(() => acquireWakeLock());
</script>

<main class="answering">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.answering]} />

  <div class="body">
    <p class="guide" data-testid="stage-guide">
      相談しながら、味方だと思う人と相手チームのテーマを選んで送ります。締切まで何度でも直せます。
    </p>

    <section class="allies">
      <h2>味方だと思う人（{publicState.maxAllyPicks}人まで）</h2>
      <ul>
        {#each others as player (player.id)}
          {@const selected = allyIds.includes(player.id)}
          <li>
            <button
              type="button"
              class="ally"
              class:selected
              data-testid="ally-option"
              data-player-id={player.id}
              aria-pressed={selected}
              disabled={!selected && atLimit}
              onclick={() => toggleAlly(player.id)}
            >
              <span class="face" style={`background:${faceColor(player.id)}`} aria-hidden="true">{playerIconOf(player.id)}</span>
              <span class="name">{player.name}</span>
              {#if selected}<span class="picked">味方</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
      {#if atLimit}
        <p class="hint">上限まで選びました。他の人を選ぶには、先に選択を外します。</p>
      {/if}
    </section>

    <section>
      <h2>相手チームのテーマ</h2>
      <ThemeChoices
        choices={publicState.themeChoices}
        myThemeId={secret?.themeId ?? null}
        {myLevel}
        selectedId={themeId}
        onSelect={(id) => (themeId = id)}
      />
    </section>

    <section class="submit" data-testid="answer-status">
      <p class="status">
        <span data-testid="ally-count">味方 {allyIds.length} / {publicState.maxAllyPicks}人</span>
        <span>相手のテーマ: {themeId === null ? "未選択" : "選んだ"}</span>
      </p>
      <button class="beb-btn yellow" data-testid="submit-answer" disabled={!canSubmit} onclick={submit}>
        <span>{hasSubmitted ? "回答を送り直す" : "回答を送る"}</span>
      </button>
      {#if hasSubmitted}
        <p class="hint" data-testid="submitted-hint">
          {sentMatches ? "送りました。" : "送った回答から変えています。送り直すと上書きされます。"}締切まで変更できます。
        </p>
      {/if}
      <p class="count" data-testid="submit-count">回答 {publicState.submittedPlayerIds.length} / {connectedCount}</p>
    </section>

    <KeyExpressions expressions={publicState.keyExpressions} {myLevel} />

    {#if secret}
      <MyCard {secret} choices={publicState.themeChoices} {myLevel} />
    {/if}
  </div>
</main>

<style>
  .answering {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
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
  .allies ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
  }
  .ally {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--ground-2);
    color: var(--panel);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.5rem;
    font-family: var(--font-body);
    text-align: left;
    cursor: pointer;
  }
  .ally:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .ally.selected {
    background: linear-gradient(var(--yellow-veil), var(--yellow-veil)), var(--ground-2);
  }
  .face {
    flex: none;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
  }
  .name {
    font-size: 0.84rem;
    overflow-wrap: anywhere;
  }
  .picked {
    margin-left: auto;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--yellow);
  }
  .status {
    margin: 0 0 0.5rem;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.82rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    color: var(--mist);
  }
  .count {
    margin: 0.5rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
