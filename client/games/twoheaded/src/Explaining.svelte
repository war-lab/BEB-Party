<!--
  説明タイム（16の画面）。説明役のペアと当てる側で画面の中身が別物になる。

  説明役のペア: お題・日本語名・言えない語・話す順・書き出しの例・「だれが当てた？」の申告・送り
  当てる側: 説明役のペア・話す順・答えるときの言い回し・直前のお題の答え
  当てる側の画面から情報を削るのは、手元を見る理由をなくして顔を上げさせるためである（DON'T SAY ITと同じ）。
-->
<script lang="ts">
  import { acquireWakeLock, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    GUESSER_PROMPTS,
    STAGES,
    explainerTeamIdOf,
    isExplainer,
    teamOf,
    type ExplainerSecret,
    type TwoHeadedPublic,
    type TwoHeadedSecret,
  } from "@beb/shared-twoheaded";
  import ForbiddenWords from "./ForbiddenWords.svelte";
  import LastCard from "./LastCard.svelte";
  import PairChip from "./PairChip.svelte";
  import SpeakingOrder from "./SpeakingOrder.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: TwoHeadedPublic;
    secret: TwoHeadedSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const explainerTeamId = $derived(explainerTeamIdOf(publicState));
  const explainerTeam = $derived(teamOf(publicState.teams, explainerTeamId));
  // 役は公開状態と秘密の両方が一致したときだけ認める。再接続直後は「新しいstate + 前の手番のsecret」を一度持つため、
  // secretだけで判定すると当てる側の端末に前の手番のお題が出る（DON'T SAY ITと同じ条件）
  const explainerSecret = $derived(
    isExplainer(publicState, ui.myPlayerId) && secret?.role === "explainer" ? (secret as ExplainerSecret) : null,
  );
  const myLevel = $derived(room.players.find((player) => player.id === ui.myPlayerId)?.level ?? 1);
  // 書き出しの例はレベル1〜2の画面では常に開き、レベル3〜5では折りたたむ（16のレベル差の吸収）
  const startersOpen = $derived(myLevel <= 2);
  const otherTeams = $derived(publicState.teams.filter((team) => team.teamId !== explainerTeamId));

  // 正解の申告は2段階にする。1タップで確定すると、誤タップがそのまま別のペアへの加点になる。
  // 開いた時点のお題のidを控える。シートを開いている間に相方が送りを押すとお題が進むため、
  // 送信時に最新のidを読むと、誰も説明していないお題で加点できてしまう。控えたidならサーバの stale_card で弾かれる
  let sheetOpen = $state(false);
  let sheetCardId = $state<string | null>(null);

  function openSheet(): void {
    sheetCardId = explainerSecret?.card.cardId ?? null;
    sheetOpen = true;
  }

  function closeSheet(): void {
    sheetOpen = false;
    sheetCardId = null;
  }

  function claim(teamId: string): void {
    if (sheetCardId === null) {
      return;
    }
    // 送れたときだけシートを閉じる。未接続だと sendAction は送らずに戻るため、
    // 閉じてしまうと届いていない加点が受け付けられたように見える（16の claimCorrect）
    if (!sendAction(ACTIONS.claimCorrect, { cardId: sheetCardId, teamId })) {
      return;
    }
    closeSheet();
  }

  function passCard(): void {
    const cardId = explainerSecret?.card.cardId;
    if (cardId === undefined) {
      return;
    }
    sendAction(ACTIONS.passCard, { cardId });
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  // 全員が画面を見ずに話し、聞く時間が続く（16のステージ）
  $effect(() => acquireWakeLock());
</script>

<main class="explaining" class:explainer={explainerSecret !== null}>
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.explaining]} />

  <p class="count" data-testid="turn-count">
    正解 {publicState.solvedThisTurn} ・ 送り {publicState.passedThisTurn}
  </p>

  <div class="body">
    {#if explainerSecret}
      <div data-testid="explainer-view">
        <p class="answer" data-testid="answer">{explainerSecret.card.answer}</p>
        <p class="answer-ja">{explainerSecret.card.ja}</p>
        <ForbiddenWords answer={explainerSecret.card.answer} aliases={explainerSecret.card.aliases} />

        <SpeakingOrder order={publicState.speakingOrder} {nameOf} />

        <div class="actions">
          <button class="beb-btn red" data-testid="claim-open" onclick={openSheet}><span>正解</span></button>
          <button class="beb-btn ghost" data-testid="pass-card" onclick={passCard}><span>送る</span></button>
        </div>

        <details class="starters" open={startersOpen} data-testid="starters">
          <summary>書き出しの例</summary>
          <ul>
            {#each publicState.starters as starter (starter.en)}
              <li><span class="en">{starter.en}</span><span class="ja">{starter.ja}</span></li>
            {/each}
          </ul>
        </details>

        <LastCard card={publicState.lastCard} teams={publicState.teams} />
      </div>

      {#if sheetOpen}
        <div class="sheet" data-testid="claim-sheet">
          <p class="sheet-title">だれが当てた？</p>
          <ul class="who">
            {#each otherTeams as team (team.teamId)}
              <li>
                <button class="pair-button" data-testid="claim-team" data-team-id={team.teamId} onclick={() => claim(team.teamId)}>
                  <PairChip {team} teams={publicState.teams} {nameOf} withNames />
                </button>
              </li>
            {/each}
          </ul>
          <button class="beb-btn ghost" onclick={closeSheet}><span>閉じる</span></button>
        </div>
      {/if}
    {:else}
      <div data-testid="guesser-view">
        <p class="listen">声を聞いて、英語で答えてください</p>
        {#if explainerTeam}
          <div class="explainers">
            <span class="sub">説明役</span>
            <PairChip team={explainerTeam} teams={publicState.teams} {nameOf} withNames />
          </div>
        {/if}
        <SpeakingOrder order={publicState.speakingOrder} {nameOf} />
        <ul class="prompts">
          {#each GUESSER_PROMPTS as prompt (prompt)}
            <li>{prompt}</li>
          {/each}
        </ul>
        <LastCard card={publicState.lastCard} teams={publicState.teams} />
      </div>
    {/if}
  </div>
</main>

<style>
  .explaining {
    position: relative;
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
  }
  /* 役の色は斜めに切った帯で出す。地の帯は背面へ回す（タイマーバーの sticky を潰さない） */
  .explaining::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 42vh;
    clip-path: polygon(0 0, 100% 0, 100% 72%, 0 100%);
    background: var(--blue-deep);
    z-index: -1;
  }
  .explaining.explainer::before {
    background: var(--red-deep);
  }
  .body {
    display: flex;
    flex-direction: column;
    padding: 0.6rem 0.9rem calc(0.9rem + var(--footer-clearance));
  }
  .count {
    margin: 0;
    padding: 0.3rem 0.9rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
    font-variant-numeric: tabular-nums;
  }
  .answer {
    font-family: var(--font-display);
    font-size: 2.3rem;
    line-height: 1.15;
    margin: 0.2rem 0 0.1rem;
    text-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
    word-break: break-word;
  }
  .answer-ja {
    font-size: 1rem;
    font-weight: 700;
    opacity: 0.75;
    margin: 0 0 0.6rem;
  }
  .actions {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 0.5rem;
    margin: 0 0 0.8rem;
  }
  .starters {
    background: rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.7rem;
  }
  .starters summary {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    color: var(--yellow);
    cursor: pointer;
  }
  .starters ul {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .starters li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
  }
  .starters .en {
    font-weight: 700;
  }
  .starters .ja {
    font-size: 0.74rem;
    color: var(--mist);
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    background: var(--ground-2);
    border-top: 4px solid var(--yellow);
    border-radius: var(--radius-card) var(--radius-card) 0 0;
    padding: 0.9rem 0.9rem calc(0.9rem + var(--footer-clearance));
    box-shadow: var(--shadow-hard);
    max-height: 85vh;
    max-height: 85dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .sheet-title {
    margin: 0 0 0.6rem;
    font-family: var(--font-display);
    font-size: 1.1rem;
  }
  .who {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  .pair-button {
    width: 100%;
    text-align: left;
    background: var(--blue-deep);
    color: var(--panel);
    border: 3px solid var(--blue);
    border-radius: var(--radius-button);
    padding: 0.6rem 0.7rem;
    font: inherit;
    cursor: pointer;
  }
  .listen {
    margin: 0.4rem 0 0.8rem;
    font-family: var(--font-display);
    font-size: 1.35rem;
    transform: skew(var(--skew-angle));
    transform-origin: left bottom;
  }
  .explainers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    background: var(--ground-2);
    border: 2px solid var(--blue);
    border-radius: var(--radius-tile);
    padding: 0.45rem 0.7rem;
    margin: 0 0 0.8rem;
  }
  .sub {
    font-size: 0.72rem;
    color: var(--mist);
  }
  .prompts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .prompts li {
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.7rem;
    font-size: 0.95rem;
    font-weight: 700;
  }
</style>
