<!--
  遊び方の確認（基本設計/16のステージと画面）。

  遊び方、ペアの一覧、交互の違反とやり直しの規則、言えない語の規則、画面を見せない約束、準備完了ボタンを出す。
  最初のお題はここでは配らない。startで配ると最初の説明役のペアだけがこの間にお題を読める（16の「送るときと値」）。
-->
<script lang="ts">
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, MAX_CARDS_PER_TURN, STAGES, type TwoHeadedPublic } from "@beb/shared-twoheaded";
  import PairChip from "./PairChip.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: TwoHeadedPublic;
  }
  let { room, publicState }: Props = $props();

  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
  const hasTrio = $derived(publicState.teams.some((team) => team.members.length === 3));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }
</script>

<main class="briefing">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.briefing]} />

  <div class="body">
    <p class="guide" data-testid="stage-guide">
      <span class="tag">いまやること</span>
      <span>ペアと規則を確かめたら「準備できた」を押してください。全員がそろうと最初のペアの手番になります。</span>
    </p>

    <h1 class="title">2人で1つの口になる</h1>

    <section class="teams" data-testid="team-list">
      <h2>ペア（説明する順）</h2>
      {#if publicState.laps > 1}
        <p class="note" data-testid="laps-note">この順で{publicState.laps}周します（全{publicState.turnOrder.length}手番）</p>
      {/if}
      <ol>
        {#each publicState.teams as team (team.teamId)}
          <li class:mine={ui.myPlayerId !== null && team.members.includes(ui.myPlayerId)}>
            <PairChip {team} teams={publicState.teams} {nameOf} withNames />
          </li>
        {/each}
      </ol>
    </section>

    <section class="how">
      <h2>遊び方</h2>
      <ul>
        <li>説明役のペアにだけお題が届きます。2人は英語を<strong>1語ずつ交互に</strong>声に出して、お題を説明します。</li>
        <li>ほかのペアは分かったら答えを英語で声に出します。最初に当てたペアを、説明役のペアが画面で選びます。</li>
        <li>当てたペアと説明役のペアに1点ずつ入ります。</li>
        <li>1手番で次のお題へ送れるのは正解と送りを合わせて{MAX_CARDS_PER_TURN}回までです。</li>
        {#if hasTrio}
          <li>3人のペアは、3人で順番に1語ずつ話します。</li>
        {/if}
      </ul>
    </section>

    <section class="rule" data-testid="alternation-rule">
      <h2>交互の違反とやり直し</h2>
      <ul>
        <li>1人が続けて2語以上言う、相方の番に言う、ペアで相談する（日本語も）のは違反です。</li>
        <li>気付いた人は <strong class="en">Two words!</strong> などと声で指摘します。言いかけの文を捨てて、話す順の先頭の人から言い直します。</li>
        <li>迷ったらセーフにします。身振りは違反にしません。</li>
      </ul>
    </section>

    <section class="rule" data-testid="forbidden-rule">
      <h2>言えない語</h2>
      <ul>
        <li>お題の名前、その中の語（<em>vending machine</em> の <em>vending</em> / <em>machine</em>、<em>toothbrush</em> の <em>tooth</em> / <em>brush</em>）</li>
        <li>画面に出る別名（<em>refrigerator</em> の <em>fridge</em>）と、これらの複数形・過去形・ing形</li>
        <li>日本語名を口に出すこと</li>
      </ul>
      <p class="note">言ってしまったら、そのお題は「送る」で捨てます。終えたお題の答えは全員の画面に出ます。</p>
    </section>

    <section class="promise">
      <h2>約束</h2>
      <p>説明役の画面を、ほかのペアに見せない。</p>
    </section>

    <p class="waiting" data-testid="ready-count">準備完了 {publicState.readyPlayerIds.length} / {connectedCount}</p>
    <button class="beb-btn red" data-testid="ready" disabled={isReady} onclick={() => sendAction(ACTIONS.ready)}>
      <span>{isReady ? "他の人を待っています" : "準備できた"}</span>
    </button>
  </div>
</main>

<style>
  .briefing {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
  }
  .body {
    display: flex;
    flex-direction: column;
    padding: 0.9rem 0.9rem calc(0.9rem + var(--footer-clearance));
  }
  .guide {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: rgba(255, 255, 255, 0.1);
    border: var(--outline-width) solid var(--yellow);
    border-radius: var(--radius-tile);
    margin: 0 0 0.8rem;
    padding: 0.5rem 0.7rem;
    font-size: 0.82rem;
    line-height: 1.6;
  }
  .tag {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
  }
  .title {
    font-family: var(--font-display);
    font-size: 1.5rem;
    margin: 0.2rem 0 0.4rem;
    transform: skew(var(--skew-angle));
    transform-origin: left bottom;
    text-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
  }
  h2 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
    margin: 1rem 0 0.35rem;
  }
  ol,
  ul {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.3rem;
    font-size: 0.84rem;
    line-height: 1.55;
  }
  .teams ol {
    list-style: none;
    padding: 0;
  }
  .teams li {
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.6rem;
  }
  .teams li.mine {
    border-color: var(--yellow);
  }
  .note {
    margin: 0.3rem 0;
    font-size: 0.78rem;
    color: var(--mist);
  }
  .promise p {
    margin: 0;
    font-size: 0.84rem;
  }
  .en {
    font-family: var(--font-body);
  }
  .waiting {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.8rem;
    color: var(--yellow);
    font-variant-numeric: tabular-nums;
    margin: 1rem 0 0.5rem;
  }
</style>
