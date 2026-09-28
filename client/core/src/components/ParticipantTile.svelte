<!-- 参加者タイル。格闘ゲームのキャラクターセレクトの文法（ビジュアルデザイン.md） -->
<script lang="ts">
  import { playerIconEmoji, type Player } from "@beb/shared-core";
  import { faceColor } from "../face-color";

  interface Props {
    player: Player;
    /**
     * 席を外す操作。渡されたときだけボタンを出す（ロビーでホストが見る切断中の他人の席。ADR-0028）。
     * どの席に出すかは呼び出し側が決める
     */
    onKick?: () => void;
  }
  let { player, onKick }: Props = $props();

  // 1回目で確認に切り替え、2回目で外す。並んだ小さなボタンを誤って押しても席が消えないようにする
  let confirming = $state(false);

  function kick(): void {
    if (!confirming) {
      confirming = true;
      return;
    }
    confirming = false;
    onKick?.();
  }
</script>

<div class="beb-tile" class:disconnected={!player.connected} data-testid="participant-tile">
  <div class="body">
    <div class="face" style={`background:${faceColor(player.id)}`} data-testid="participant-icon">
      <span aria-hidden="true">{playerIconEmoji(player.icon)}</span>
    </div>
    <span class="tile-name">{player.name}</span>
    <span class="lv" aria-label={`レベル${player.level}`}>Lv.{player.level}</span>
  </div>
  {#if player.isHost}
    <span class="host-badge">HOST</span>
  {/if}
  {#if !player.connected}
    <span class="disconnected-badge">切断中</span>
  {/if}
  {#if onKick}
    <button
      class="kick"
      class:confirming
      onclick={kick}
      onblur={() => (confirming = false)}
      aria-label={confirming ? `${player.name}さんを外す（確定）` : `${player.name}さんを部屋から外す`}
      data-testid="kick"
    >
      {confirming ? "外す？" : "外す"}
    </button>
  {/if}
</div>

<style>
  .beb-tile {
    position: relative;
  }
  /* 淡色にするのは本体だけ。外すボタンまで薄くすると押せる操作に見えない */
  .beb-tile.disconnected .body {
    opacity: 0.55;
  }
  .kick {
    margin-top: 0.3rem;
    width: 100%;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.66rem;
    color: var(--ink);
    background: var(--panel);
    border: 2px solid var(--ink);
    border-radius: var(--radius-button);
    padding: 0.1rem 0.4rem;
    cursor: pointer;
  }
  .kick.confirming {
    background: var(--red);
    border-color: var(--red-deep);
    color: #fff;
  }
  .host-badge {
    position: absolute;
    top: -0.55rem;
    right: -0.4rem;
    background: var(--red);
    color: #fff;
    border-radius: var(--radius-button);
    padding: 0.05rem 0.45rem;
    font-size: 0.62rem;
    font-family: var(--font-display);
    transform: rotate(6deg);
  }
  .disconnected-badge {
    display: block;
    font-size: 0.62rem;
    font-weight: 700;
    margin-top: 0.2rem;
    color: var(--ink-soft);
  }
</style>
