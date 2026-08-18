<!-- ホーム。空色グラデ＋斜めスピードライン、丸ボタン2択（ビジュアルデザイン.mdのモック） -->
<script lang="ts">
  import { untrack } from "svelte";
  import type { Level } from "@beb/shared-core";
  import { connect } from "../connection";

  interface Props {
    onEnter: (code: string) => void;
    /** URLで指定された部屋コード。QR・共有リンクから開いたときに埋めておく */
    initialCode?: string | null;
  }
  let { onEnter, initialCode = null }: Props = $props();

  const LEVELS: Level[] = [1, 2, 3, 4, 5];

  let name = $state("");
  let level = $state<Level>(3);
  // 初期表示のときだけ使う値であり、以後の変化は追わない
  let codeInput = $state(untrack(() => initialCode) ?? "");
  let creating = $state(false);
  let joining = $state(untrack(() => initialCode) !== null);
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

<main class="home beb-speedlines-light">
  <div class="logo">BEB<br /><em>PARTY!</em></div>
  <span class="tagline">えいごで すいり パーティ</span>

  <div class="entry">
    <label class="field">
      <span class="field-label">なまえ</span>
      <input bind:value={name} maxlength="20" placeholder="なまえ" />
    </label>

    <fieldset class="levels">
      <legend class="field-label">英語レベル</legend>
      {#each LEVELS as option (option)}
        <label class="level-chip" class:selected={level === option}>
          <input type="radio" name="level" value={option} bind:group={level} />
          <span>Lv.{option}</span>
        </label>
      {/each}
    </fieldset>
  </div>

  {#if !joining}
    <button class="beb-btn red" onclick={createRoom} disabled={creating}><span>部屋を作る</span></button>
    <button class="beb-btn blue" onclick={() => (joining = true)}><span>部屋に参加する</span></button>
  {:else}
    <label class="field">
      <span class="field-label">部屋コード</span>
      <input class="code-input" bind:value={codeInput} maxlength="4" placeholder="部屋コード" />
    </label>
    <button class="beb-btn blue" onclick={joinRoom}><span>参加する</span></button>
    <button class="beb-btn ghost" onclick={() => (joining = false)}><span>もどる</span></button>
  {/if}

  {#if errorMessage}
    <p class="error">{errorMessage}</p>
  {/if}
</main>

<style>
  .home {
    min-height: 100vh;
    background-color: var(--sky);
    background-image:
      repeating-linear-gradient(var(--skew-angle), rgba(255, 255, 255, 0.1) 0 3px, transparent 3px 46px),
      linear-gradient(180deg, var(--sky) 0%, var(--sky-deep) 70%, #0f6bb8 100%);
    color: #fff;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.6rem 1.4rem calc(1.6rem + var(--footer-clearance));
  }

  .logo {
    font-family: var(--font-display);
    font-size: 2.75rem;
    line-height: 1;
    color: #fff;
    transform: skew(var(--skew-angle)) rotate(-2deg);
    text-shadow: 0 5px 0 rgba(13, 20, 46, 0.45);
  }
  .logo em {
    font-style: normal;
    color: var(--yellow);
  }

  .tagline {
    align-self: flex-start;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.75rem;
    color: #fff;
    background: var(--ink);
    padding: 0.3rem 0.75rem;
    border-radius: var(--radius-button);
    transform: skew(var(--skew-angle));
    margin-bottom: 1rem;
  }

  .entry {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .field {
    display: grid;
    gap: 0.25rem;
  }

  .field-label {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--ink);
    background: var(--yellow);
    border-radius: var(--radius-button);
    padding: 0.05rem 0.6rem;
    justify-self: start;
  }

  input {
    font-family: var(--font-body);
    font-size: 1rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.55rem 0.75rem;
    width: 100%;
  }

  .code-input {
    font-family: var(--font-display);
    font-size: 1.5rem;
    letter-spacing: 0.3em;
    text-align: center;
  }

  .levels {
    border: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .levels legend {
    padding: 0;
    margin-bottom: 0.25rem;
  }

  .level-chip {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.8rem;
    color: var(--ink);
    background: var(--panel);
    border: var(--outline-width) solid var(--ink);
    border-radius: var(--radius-button);
    padding: 0.2rem 0.7rem;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .level-chip.selected {
    background: var(--blue);
    color: #fff;
  }
  .level-chip input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .level-chip:focus-within {
    outline: var(--outline-width) solid var(--yellow);
  }

  .error {
    background: var(--ink);
    color: var(--yellow);
    font-weight: 700;
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.75rem;
    margin: 0;
  }
</style>
