<!--
  説明（基本設計/17のステージと画面）。手番1回につき1回入る。

  手番の人と順番の一覧（何周目か）、選択肢6件、言い回し、残り時間、自分の単語とテーマを出す。
  手番の人には「説明を終える」ボタンを出す。押し忘れても締切で進む。
  自分の単語とテーマは画面の上部に大きく出さず、下の方に置く（17の画面）。
-->
<script lang="ts">
  import { acquireWakeLock, faceColor, playerIconOf, sendAction, StageTimer, ui } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    STAGES,
    lapOf,
    speakerOf,
    totalTurnsOf,
    type SecretTeamsPublic,
    type SecretTeamsSecret,
  } from "@beb/shared-secretteams";
  import KeyExpressions from "./KeyExpressions.svelte";
  import MyCard from "./MyCard.svelte";
  import SpeakerOrder from "./SpeakerOrder.svelte";
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
  const speaker = $derived(speakerOf(publicState));
  const isSpeaker = $derived(speaker !== undefined && speaker === myId);
  const lap = $derived(lapOf(publicState));
  const label = $derived(`${stageLabels[STAGES.clue]} ${lap}/${publicState.laps}周目`);

  // 自分の番まであと何人か。飛ばす手番は手番に入る時点で決まるため、ここでは数に含めて出す
  const untilMine = $derived.by(() => {
    const total = totalTurnsOf(publicState);
    for (let turnIndex = publicState.turnIndex + 1; turnIndex < total; turnIndex += 1) {
      if (speakerOf({ speakerOrder: publicState.speakerOrder, turnIndex }) === myId) {
        return turnIndex - publicState.turnIndex;
      }
    }
    return null;
  });

  function nameOf(playerId: string | undefined): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId ?? "";
  }

  function finish(): void {
    sendAction(ACTIONS.done, { turnIndex: publicState.turnIndex });
  }

  // 手番の人以外は聞いているだけの時間が続き、画面に触らない（17のステージ）
  $effect(() => acquireWakeLock());
</script>

<main class="clue" data-testid="clue" data-turn-index={publicState.turnIndex}>
  <StageTimer deadline={room.deadline} {label} />

  <div class="body">
    <section class="current" data-testid="current-speaker" data-player-id={speaker}>
      <p class="caption">いま説明している人</p>
      <p class="who">
        {#if speaker}
          <span class="face" style={`background:${faceColor(speaker)}`} aria-hidden="true">{playerIconOf(speaker)}</span>
        {/if}
        <span class="name">{nameOf(speaker)}</span>
        {#if isSpeaker}<span class="beb-pill self">あなた</span>{/if}
      </p>
    </section>

    {#if isSpeaker}
      <p class="guide" data-testid="stage-guide">
        あなたの番です。自分の単語を英語で遠回しに説明してください。単語とテーマ名はそのまま言いません。
      </p>
      <button class="beb-btn yellow" data-testid="done" onclick={finish}><span>説明を終える</span></button>
    {:else}
      <p class="listen" data-testid="listen">
        説明を聞いて、味方かどうかを考えます。英語で質問してもかまいません。
        {#if untilMine !== null}
          <span class="until" data-testid="until-mine">あなたの番まであと{untilMine}人</span>
        {:else}
          <span class="until" data-testid="until-mine">あなたの説明は終わりました</span>
        {/if}
      </p>
    {/if}

    <section>
      <h2>説明の順番（{lap}周目）</h2>
      <SpeakerOrder {room} {publicState} showProgress />
    </section>

    <section>
      <h2>テーマの選択肢</h2>
      <ThemeChoices choices={publicState.themeChoices} myThemeId={secret?.themeId ?? null} {myLevel} />
    </section>

    <KeyExpressions expressions={publicState.keyExpressions} {myLevel} />

    {#if secret}
      <MyCard {secret} choices={publicState.themeChoices} {myLevel} />
    {/if}
  </div>
</main>

<style>
  .clue {
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    padding-bottom: var(--footer-clearance);
  }
  .body {
    padding: 0.9rem 1rem 1.4rem;
  }
  .current {
    margin: 0 0 0.7rem;
    text-align: center;
  }
  .caption {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .who {
    margin: 0.3rem 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 1.3rem;
    font-weight: 700;
  }
  .face {
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
  }
  .name {
    overflow-wrap: anywhere;
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
  .listen {
    margin: 0 0 0.9rem;
    background: var(--ground-2);
    border: var(--outline-width) solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--mist);
  }
  .until {
    display: block;
    margin-top: 0.2rem;
    font-weight: 700;
    color: var(--panel);
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
  [data-testid="done"] {
    margin: 0 0 0.9rem;
  }
</style>
