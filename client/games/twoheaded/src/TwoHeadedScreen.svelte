<!--
  ステージごとの画面へ振り分ける入口。client/coreがgameId→この画面のテーブルを引いて表示する。
  未知のstageは汎用の待機表示にフォールバックする（基本設計/02）。
-->
<script lang="ts">
  import { result as resultStore, secret as secretStore } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import { STAGES, type TwoHeadedPublic, type TwoHeadedResult, type TwoHeadedSecret } from "@beb/shared-twoheaded";
  import Briefing from "./Briefing.svelte";
  import Debrief from "./Debrief.svelte";
  import Explaining from "./Explaining.svelte";
  import Handoff from "./Handoff.svelte";

  interface Props {
    room: Room;
    onLeave: () => void;
  }
  let { room, onLeave }: Props = $props();

  // サーバ権威。受信済みスナップショットを描くだけで、クライアントで組み立て直さない
  const publicState = $derived(room.gameState as TwoHeadedPublic | undefined);
  const secret = $derived((secretStore.payload as TwoHeadedSecret | null) ?? null);
  // 別ゲームの結果をキャストしない。room.gameId と照合してから読む
  const result = $derived(
    resultStore.gameId === room.gameId ? ((resultStore.payload as TwoHeadedResult | null) ?? null) : null,
  );
</script>

{#if !publicState}
  <main class="waiting"><p>しばらくお待ちください…</p></main>
{:else if room.stage === STAGES.briefing}
  <Briefing {room} {publicState} />
{:else if room.stage === STAGES.handoff}
  <!-- 手番ごとに作り直す。伏せ面を開いたまま次の手番のお題を出さない（SecretCoverの注意書き） -->
  {#key publicState.turnIndex}
    <Handoff {room} {publicState} {secret} />
  {/key}
{:else if room.stage === STAGES.explaining}
  <Explaining {room} {publicState} {secret} />
{:else if room.stage === STAGES.debrief}
  <Debrief {room} {result} {onLeave} />
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
