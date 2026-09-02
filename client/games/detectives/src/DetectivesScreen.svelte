<!--
  ステージごとの画面へ振り分ける入口。client/coreがgameId→この画面のテーブルを引いて表示する。
  未知のstageは汎用の待機表示にフォールバックする（基本設計/02）。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import { STAGES, type DetectivesPublic, type DetectivesResult, type DetectivesSecret } from "@beb/shared-detectives";
  import { result as resultStore, secret as secretStore } from "@beb/client-core";
  import Briefing from "./Briefing.svelte";
  import Investigation from "./Investigation.svelte";
  import Reveal from "./Reveal.svelte";
  import Voting from "./Voting.svelte";

  interface Props {
    room: Room;
    onLeave: () => void;
  }
  let { room, onLeave }: Props = $props();

  // サーバ権威。受信済みスナップショットを描くだけで、クライアントで組み立て直さない
  const publicState = $derived(room.gameState as DetectivesPublic | undefined);
  const secret = $derived((secretStore.payload as DetectivesSecret | null) ?? null);
  // 別ゲームの結果をキャストしない。room.gameId と照合してから読む
  const result = $derived(
    resultStore.gameId === room.gameId ? ((resultStore.payload as DetectivesResult | null) ?? null) : null,
  );
</script>

{#if !publicState}
  <main class="waiting"><p>しばらくお待ちください…</p></main>
{:else if room.stage === STAGES.briefing}
  <Briefing {room} {publicState} {secret} />
{:else if room.stage === STAGES.investigation}
  <Investigation {room} {publicState} {secret} />
{:else if room.stage === STAGES.voting}
  <Voting {room} {publicState} />
{:else if room.stage === STAGES.reveal}
  <Reveal {room} {publicState} {result} {onLeave} />
{:else}
  <main class="waiting"><p>しばらくお待ちください…</p></main>
{/if}

<style>
  .waiting {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--mist);
    font-family: var(--font-body);
  }
</style>
