<!--
  候補の確認（基本設計/14のステージと画面）。

  遊び方の要点、語の数え方の例、画面を見せない約束、候補6件を出す。
  語の数え方は判定関数の定義と揃える（14の「語の数え方」）。例を変えるときは正本と揃える。
-->
<script lang="ts">
  import { sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, MAX_ROUNDS, STAGES, TESTS_PER_ROUND, type SecretRulePublic } from "@beb/shared-secretrule";
  import CandidateList from "./CandidateList.svelte";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: SecretRulePublic;
  }
  let { room, publicState }: Props = $props();

  const myLevel = $derived(room.players.find((player) => player.id === ui.myPlayerId)?.level ?? 1);
  const isReady = $derived(ui.myPlayerId !== null && publicState.readyPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
</script>

<main class="briefing">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.briefing]} />

  <div class="body">
    <StageGuide step="briefing" />

    <section class="how">
      <h2>遊び方</h2>
      <ul>
        <li>下の6つのうち1つだけが、英文が「通る」ための秘密の規則です。</li>
        <li>毎ラウンド全員が英文を書き、そのうち{TESTS_PER_ROUND}つを試します。</li>
        <li>通ったかどうかは、書いた本人の画面にしか出ません。英語で伝え合ってください。</li>
        <li>規則だと思う候補を選びます。選んだ人の選択が1つに揃ったままラウンドを終えると、それが答えになります。最大{MAX_ROUNDS}ラウンドです。</li>
      </ul>
    </section>

    <section class="count" data-testid="counting-examples">
      <h2>語の数え方</h2>
      <ul>
        <li><span class="en">I'm happy.</span> は2語。I'm や I've は I とは別の語として扱う</li>
        <li><span class="en">I have 3 cats!</span> は4語。数字も1語に数える</li>
        <li><span class="en">I couldn't sleep.</span> の couldn't は7文字。記号は文字に数えない</li>
        <li><span class="en">black-and-white</span> は1語で13文字。black とは別の語として扱う</li>
      </ul>
    </section>

    <p class="promise" data-testid="no-showing-promise">自分の画面はほかの人に見せないでください。</p>

    <CandidateList candidates={publicState.candidates} {myLevel} />

    <button
      class="beb-btn yellow"
      data-testid="ready"
      disabled={isReady}
      onclick={() => sendAction(ACTIONS.ready)}
    >
      <span>{isReady ? "準備できた" : "読んだ"}</span>
    </button>
    <p class="waiting" data-testid="ready-count">じゅんび {publicState.readyPlayerIds.length} / {connectedCount}</p>
  </div>
</main>

<style>
  .briefing {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
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
  ul {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.25rem;
    font-size: 0.84rem;
    line-height: 1.5;
  }
  .en {
    font-weight: 700;
  }
  .promise {
    margin: 0 0 0.9rem;
    background: var(--ground-2);
    border: var(--outline-width) solid var(--yellow);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
    font-size: 0.84rem;
    font-weight: 700;
  }
  .waiting {
    margin: 0.6rem 0 0;
    text-align: center;
    font-size: 0.82rem;
    color: var(--mist);
    font-variant-numeric: tabular-nums;
  }
</style>
