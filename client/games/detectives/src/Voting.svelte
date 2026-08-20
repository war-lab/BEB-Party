<!-- 投票VS画面（ビジュアルデザイン.mdのモック `.s-vote`）。赤青の斜め分割、選択タイルは黄色の太枠 -->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { ACTIONS, STAGES, type DetectivesPublic } from "@beb/shared-detectives";
  import { acquireWakeLock, faceColor, playerIconOf, sendAction, StageTimer, ui } from "@beb/client-core";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: DetectivesPublic;
  }
  let { room, publicState }: Props = $props();

  let selected = $state<string | null>(null);

  const hasVoted = $derived(ui.myPlayerId !== null && publicState.votedPlayerIds.includes(ui.myPlayerId));
  const connectedCount = $derived(room.players.filter((player) => player.connected).length);
  const suspects = $derived(publicState.cast.filter((entry) => entry.playerId !== ui.myPlayerId));

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  function confirm(): void {
    if (selected === null) {
      return;
    }
    // 集計・勝敗はサーバが行う。ここは送るだけ（基本設計/02の禁止事項）
    sendAction(ACTIONS.vote, { targetPlayerId: selected });
  }

  $effect(() => acquireWakeLock());
</script>

<main class="voting">
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.voting]} />

  <div class="body">
    <StageGuide step="voting" />

    <p class="vs-title">WHO IS THE CULPRIT?</p>
    <p class="vs-sub">犯人だと思う1人を選んで投票（{publicState.votedPlayerIds.length} / {connectedCount}）</p>

    {#if hasVoted}
      <p class="done" data-testid="vote-done">投票しました。他の人を待っています。</p>
    {:else}
      <ul class="roster">
        {#each suspects as suspect (suspect.playerId)}
          <li>
            <button
              class="beb-tile suspect"
              class:sel={selected === suspect.playerId}
              onclick={() => (selected = suspect.playerId)}
            >
              <span class="face" style={`background:${faceColor(suspect.playerId)}`}>
                {#if playerIconOf(suspect.playerId)}
                  <img src={playerIconOf(suspect.playerId)!.src} alt="" />
                {/if}
              </span>
              <span class="tile-name">{nameOf(suspect.playerId)}</span>
              <span class="character">{suspect.characterName}</span>
            </button>
          </li>
        {/each}
      </ul>

      <button class="beb-btn yellow" onclick={confirm} disabled={selected === null}>
        <span>この人に投票する</span>
      </button>
    {/if}
  </div>
</main>

<style>
  .voting {
    min-height: 100vh;
    background: linear-gradient(100deg, var(--red-deep) 0 47%, #8b1f4b 47% 53%, var(--blue-deep) 53% 100%);
    color: #fff;
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 1rem 0.9rem calc(1rem + var(--footer-clearance));
    flex: 1;
  }

  .vs-title {
    font-family: var(--font-display);
    text-align: center;
    font-size: 1.2rem;
    margin: 0.2rem 0 0;
    transform: skew(var(--skew-angle));
    text-shadow: 0 4px 0 rgba(0, 0, 0, 0.4);
  }
  .vs-sub {
    text-align: center;
    font-size: 0.75rem;
    color: #ffd9d9;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .roster {
    list-style: none;
    margin: 0.3rem 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.55rem;
  }

  .suspect {
    width: 100%;
    cursor: pointer;
    position: relative;
    min-height: 4.8rem;
  }
  .suspect .character {
    display: block;
    font-size: 0.66rem;
    color: var(--ink-soft);
    margin-top: 0.15rem;
  }
  .suspect.sel {
    outline: 5px solid var(--yellow);
    outline-offset: -2px;
  }
  .suspect.sel::after {
    content: "投票";
    position: absolute;
    top: -0.6rem;
    right: -0.35rem;
    font-family: var(--font-display);
    font-size: 0.62rem;
    color: var(--ink);
    background: var(--yellow);
    border-radius: var(--radius-button);
    padding: 0.1rem 0.5rem;
    transform: rotate(6deg);
  }

  .beb-btn {
    margin-top: auto;
  }

  .done {
    margin-top: 2rem;
    text-align: center;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    background: rgba(13, 20, 46, 0.65);
    border-radius: var(--radius-tile);
    padding: 0.7rem;
  }
</style>
