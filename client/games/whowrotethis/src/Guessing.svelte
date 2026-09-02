<!--
  作者当て（基本設計/11のステージ）。

  開示中の提出を大きく出し、その下に候補タイルを並べる。
  作者が判明した人もタイルの明暗を変えずに残す（消去法の作業にしないため。ビジュアルデザイン）。
  自分の文が出ている端末には候補を出さない。指名は成立しない操作である。
-->
<script lang="ts">
  import { acquireWakeLock, faceColor, playerIconOf, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, STAGES, type WhoWroteThisPublic, type WhoWroteThisSecret } from "@beb/shared-whowrotethis";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: WhoWroteThisPublic;
    secret: WhoWroteThisSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const presented = $derived(publicState.presented);
  const itemLabel = $derived(presented === null ? "" : `${presented.index + 1} / ${presented.total}件目`);
  const hasGuessed = $derived(
    ui.myPlayerId !== null && (presented?.guessedPlayerIds.includes(ui.myPlayerId) ?? false),
  );
  // サーバは作者を伏せる。自分が作者かどうかは、本人だけが持つ提出の識別子との一致で判定する。
  // 提出テキストの一致では判定しない。同じ英文は合法であり、2人が同じ文を出すと
  // 作者でない側まで作者として扱われ、その人の指名UIが消えて締切まで進行が止まる
  const mySubmissionId = $derived(secret?.roundIndex === publicState.roundIndex ? secret.submissionId : undefined);
  const isAuthor = $derived(
    presented !== null && mySubmissionId !== undefined && presented.submissionId === mySubmissionId,
  );
  const candidates = $derived(
    room.players.filter(
      (player) => publicState.submittedPlayerIds.includes(player.id) && player.id !== ui.myPlayerId,
    ),
  );
  const guessedCount = $derived(presented?.guessedPlayerIds.length ?? 0);
  const expectedCount = $derived(room.players.filter((player) => player.connected).length - 1);

  // 提出を読んで英語で言い合うステージ。指名を押すまで画面に触らない時間が続く
  $effect(() => acquireWakeLock());

  // 送信済みの指名を件番号つきで持つ。サーバのhasGuessedが返るまでの間に2件目を送ると、
  // サーバは初回を採用して2件目をalready_guessedで拒否する一方、画面は2件目を指名先として出す。
  // 件番号を併せて持つことで、次の件へ進んだときに自然と解ける
  let picked = $state<string | null>(null);
  let pickedIndex = $state<number | null>(null);
  const hasPicked = $derived(picked !== null && pickedIndex === presented?.index);
  const locked = $derived(hasGuessed || hasPicked);

  function guess(targetPlayerId: string): void {
    if (presented === null || locked) {
      return;
    }
    picked = targetPlayerId;
    pickedIndex = presented.index;
    sendAction(ACTIONS.guess, { index: presented.index, targetPlayerId });
  }
</script>

<main class="guessing">
  <StageTimer deadline={room.deadline} label={`${stageLabels[STAGES.guessing]} ${itemLabel}`} />

  <div class="body">
    <StageGuide step="guessing" isAuthor={isAuthor} />

    {#if presented}
      <section class="card" data-testid="presented-text">
        <p>{presented.text}</p>
      </section>

      {#if isAuthor}
        <p class="picked" data-testid="own-submission">これはあなたの文です。指名はできません。</p>
      {:else if locked}
        <p class="picked" data-testid="picked">
          指名しました。{hasPicked && picked !== null
            ? (room.players.find((player) => player.id === picked)?.name ?? "")
            : ""}
        </p>
      {:else}
        <ul class="candidates" data-testid="candidate-list">
          {#each candidates as player (player.id)}
            <li>
              <button type="button" disabled={locked} data-testid={`guess-${player.id}`} onclick={() => guess(player.id)}>
                <span class="face" style={`background:${faceColor(player.id)}`}>
                  <span aria-hidden="true">{playerIconOf(player.id)}</span>
                </span>
                <span class="name">{player.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <p class="waiting" data-testid="guessed-count">しめい {guessedCount} / {expectedCount}</p>

      {#if publicState.keyExpressions.length > 0}
        <section class="expressions" data-testid="key-expressions">
          <h2>言い合うときの言い方</h2>
          <ul>
            {#each publicState.keyExpressions as expression (expression.en)}
              <li>
                <span class="en">{expression.en}</span>
                <span class="ja">{expression.ja}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {:else}
      <p class="waiting">しばらくお待ちください…</p>
    {/if}
  </div>
</main>

<style>
  .guessing {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .card {
    margin: 0 0 1rem;
    background: var(--panel);
    color: var(--ink);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 1rem 0.9rem;
  }
  .card p {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    line-height: 1.35;
  }
  .candidates {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.4rem;
  }
  .candidates button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    background: var(--ground-2);
    color: var(--panel);
    border: var(--outline-width) solid rgba(255, 255, 255, 0.18);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.6rem;
    font-family: var(--font-body);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .candidates button:active {
    border-color: var(--yellow);
  }
  .face {
    display: block;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.3);
    text-align: center;
    line-height: 1.5rem;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .picked {
    margin: 0;
    padding: 0.6rem;
    text-align: center;
    background: var(--ground-2);
    border: 2px solid var(--yellow);
    border-radius: var(--radius-tile);
    font-size: 0.88rem;
  }
  .expressions {
    margin: 1rem 0 0;
    background: var(--ground-2);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-tile);
    padding: 0.55rem 0.7rem;
  }
  .expressions h2 {
    margin: 0 0 0.4rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .expressions ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .expressions li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
  }
  .expressions .en {
    font-size: 0.88rem;
  }
  .expressions .ja {
    font-size: 0.72rem;
    color: var(--mist);
  }
  .waiting {
    margin: 0.8rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
