<!--
  ステージごとの画面へ振り分ける入口。client/coreがgameId→この画面のテーブルを引いて表示する。
  未知のstageは汎用の待機表示にフォールバックする（基本設計/02）。
-->
<script lang="ts">
  import { result as resultStore, secret as secretStore } from "@beb/client-core";
  import type { Room } from "@beb/shared-core";
  import {
    STAGES,
    type WhoWroteThisPublic,
    type WhoWroteThisResult,
    type WhoWroteThisSecret,
  } from "@beb/shared-whowrotethis";
  import Briefing from "./Briefing.svelte";
  import Guessing from "./Guessing.svelte";
  import Judging from "./Judging.svelte";
  import Reveal from "./Reveal.svelte";
  import Writing from "./Writing.svelte";

  interface Props {
    room: Room;
    /** 共通コアが渡す退出処理。結果画面はnextGameで部屋に残るため使わない */
    onLeave?: () => void;
  }
  let { room }: Props = $props();

  // サーバ権威。受信済みスナップショットを描くだけで、クライアントで組み立て直さない
  const publicState = $derived(room.gameState as WhoWroteThisPublic | undefined);
  const secret = $derived((secretStore.payload as WhoWroteThisSecret | null) ?? null);
  const result = $derived((resultStore.payload as WhoWroteThisResult | null) ?? null);
</script>

{#if !publicState}
  <main class="waiting"><p>しばらくお待ちください…</p></main>
{:else if room.stage === STAGES.briefing}
  <Briefing {room} {publicState} {secret} />
{:else if room.stage === STAGES.writing}
  <Writing {room} {publicState} {secret} />
{:else if room.stage === STAGES.guessing}
  <Guessing {room} {publicState} {secret} />
{:else if room.stage === STAGES.judging}
  <Judging {room} {publicState} />
{:else if room.stage === STAGES.reveal}
  <Reveal {room} {publicState} {result} />
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
