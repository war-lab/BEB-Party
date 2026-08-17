<script lang="ts">
  import type { Component } from "svelte";
  import { serverState } from "./stores/server-state.svelte";
  import { connect, disconnect } from "./connection";
  import ConnectionBanner from "./components/ConnectionBanner.svelte";
  import Home from "./components/Home.svelte";
  import HowToPlay from "./components/HowToPlay.svelte";
  import Lobby from "./components/Lobby.svelte";
  import LicenseNotice from "./components/LicenseNotice.svelte";
  import UnknownStage from "./components/UnknownStage.svelte";

  let showLicense = $state(false);
  let showHowToPlay = $state(false);

  // client/appがgameId→画面ローダーのテーブルを組み立てて渡す。client/coreはここに何が
  // 登録されているかを知らない（基本設計/07、ADR-0009）
  interface Props {
    gameScreens: Record<string, () => Promise<{ default: Component }>>;
    gameGuides: Record<string, () => Promise<{ default: Component }>>;
  }
  let { gameScreens, gameGuides }: Props = $props();

  let code = $state<string | null>(null);
  let gameScreen = $state<Component | null>(null);

  function enterRoom(newCode: string): void {
    code = newCode;
    history.pushState({}, "", `/room/${newCode}`);
  }

  function leaveRoom(): void {
    disconnect();
    code = null;
    history.pushState({}, "", "/");
  }

  // マウント時にURL(/room/:code)を読み、リロード・タブ復帰でもロビーへ自動復帰する。
  // reconnectTokenがsessionStorageにあれば、サーバは名前・レベルの送信値を無視して既存プレイヤーとして扱う。
  // $effectは追跡対象の$stateを読まないため、Svelteのスケジューラが後続のflushで再実行することがあり
  // (enterRoom→history.pushState後に実際に再実行され、connect()が二重に呼ばれることを実測した)、
  // 「マウント時に1回だけ」という意図には$effectではなくスクリプトトップレベルの一度きりの実行を使う
  const initialMatch = /^\/room\/([A-Z0-9]{4})$/.exec(location.pathname);
  if (initialMatch?.[1]) {
    const restoredCode = initialMatch[1];
    code = restoredCode;
    connect(restoredCode, "", 1);
  }

  $effect(() => {
    const room = serverState.room;
    if (!room?.gameId || (room.lifecycle !== "playing" && room.lifecycle !== "finished")) {
      gameScreen = null;
      return;
    }
    const loader = gameScreens[room.gameId];
    if (!loader) {
      gameScreen = null;
      return;
    }
    loader().then((mod) => {
      gameScreen = mod.default;
    });
  });

  const room = $derived(serverState.room);
</script>

<ConnectionBanner />

{#if !code}
  <Home onEnter={enterRoom} />
{:else if !room || room.lifecycle === "lobby"}
  <Lobby {code} />
{:else if gameScreen}
  {@const Screen = gameScreen}
  <Screen {room} onLeave={leaveRoom} />
{:else}
  <UnknownStage />
{/if}

<footer class="license-footer">
  <!-- 遊び方はどの画面からも開ける。捜査中にルールを確認したい場面があるため -->
  <button class="license-link" onclick={() => (showHowToPlay = true)}>遊び方</button>
  <button class="license-link" onclick={() => (showLicense = true)}>書体のライセンス表記</button>
</footer>

{#if showHowToPlay}
  <HowToPlay {gameGuides} onClose={() => (showHowToPlay = false)} />
{/if}

{#if showLicense}
  <LicenseNotice onClose={() => (showLicense = false)} />
{/if}

<style>
  .license-footer {
    position: fixed;
    bottom: 0;
    right: 0;
    padding: 0.25rem 0.5rem;
    z-index: 900;
    display: flex;
    gap: 0.75rem;
  }
  .license-link {
    background: none;
    border: none;
    color: var(--ink, #161b33);
    text-decoration: underline;
    font-size: 0.75rem;
    cursor: pointer;
  }
</style>
