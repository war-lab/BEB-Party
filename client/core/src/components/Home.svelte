<script lang="ts">
  import type { Level } from "@beb/shared-core";
  import { connect } from "../connection";

  interface Props {
    onEnter: (code: string) => void;
  }
  let { onEnter }: Props = $props();

  let name = $state("");
  let level = $state<Level>(3);
  let codeInput = $state("");
  let creating = $state(false);
  let errorMessage = $state<string | null>(null);

  function enterRoom(code: string): void {
    connect(code, name.trim() || "プレイヤー", level);
    onEnter(code);
  }

  async function createRoom(): Promise<void> {
    creating = true;
    errorMessage = null;
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
      if (!response.ok) {
        errorMessage = "部屋を作成できませんでした。しばらくしてから試してください";
        return;
      }
      const body = (await response.json()) as { code: string };
      enterRoom(body.code);
    } catch {
      errorMessage = "部屋を作成できませんでした。しばらくしてから試してください";
    } finally {
      creating = false;
    }
  }

  function joinRoom(): void {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 4) {
      errorMessage = "4文字の部屋コードを入力してください";
      return;
    }
    errorMessage = null;
    enterRoom(code);
  }
</script>

<main class="home">
  <h1>BEB Party</h1>

  <label>
    なまえ
    <input bind:value={name} maxlength="20" placeholder="なまえ" />
  </label>

  <label>
    レベル
    <select bind:value={level}>
      {#each [1, 2, 3, 4, 5] as l (l)}
        <option value={l}>{l}</option>
      {/each}
    </select>
  </label>

  <button class="primary" onclick={createRoom} disabled={creating}>部屋を作る</button>

  <div class="join">
    <input bind:value={codeInput} maxlength="4" placeholder="部屋コード" />
    <button onclick={joinRoom}>参加する</button>
  </div>

  {#if errorMessage}
    <p class="error">{errorMessage}</p>
  {/if}
</main>

<style>
  .home {
    min-height: 100vh;
    background: var(--sky);
    color: var(--ink);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    /* 下端は固定フッター（遊び方・ライセンス）の分を空ける */
    padding: 2rem 1rem calc(1rem + var(--footer-clearance));
  }
  h1 {
    font-family: var(--font-display);
    transform: skew(var(--skew-angle));
  }
  .primary {
    background: var(--red);
    color: white;
    border: none;
    border-radius: var(--radius-button);
    padding: 0.75rem 2rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    box-shadow: var(--shadow-hard);
  }
  .join {
    display: flex;
    gap: 0.5rem;
  }
  .error {
    color: var(--red);
    font-weight: 700;
  }
</style>
