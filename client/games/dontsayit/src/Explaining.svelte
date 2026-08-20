<!--
  説明タイム。3役で画面の中身が別物になる（ビジュアルデザイン.mdの画面別の要点）。

  共通なのは上部固定の黄色いタイマーバーと、そのラウンドで成立した枚数だけとする。
  回答者の画面から情報を削るのは、手元を見る理由をなくして顔を上げさせるためである。
-->
<script lang="ts">
  import type { Room } from "@beb/shared-core";
  import {
    ACTIONS,
    ANSWERER_PROMPTS,
    STAGES,
    speakerPlayerIdOf,
    watcherPlayerIdOf,
    type DontSayItPublic,
    type DontSayItSecret,
    type SpeakerSecret,
    type WatcherSecret,
  } from "@beb/shared-dontsayit";
  import { acquireWakeLock, faceColor, sendAction, StageTimer, ui } from "@beb/client-core";
  import StageGuide from "./StageGuide.svelte";
  import { stageLabels } from "./stage-labels";

  interface Props {
    room: Room;
    publicState: DontSayItPublic;
    secret: DontSayItSecret | null;
  }
  let { room, publicState, secret }: Props = $props();

  const speakerId = $derived(speakerPlayerIdOf(publicState));
  const watcherId = $derived(watcherPlayerIdOf(publicState));

  // 役は公開状態と秘密の両方が一致したときだけ認める。
  // 再接続直後は「新しいstate + 1ラウンド前のsecret」を一度持つため、secretだけで判定すると
  // 回答者の端末に前の役の画面（人物名を含む）が出る（Handoff.svelteと同じ条件にそろえる）
  const isSpeaker = $derived(ui.myPlayerId !== null && ui.myPlayerId === speakerId && secret?.role === "speaker");
  const isWatcher = $derived(ui.myPlayerId !== null && ui.myPlayerId === watcherId && secret?.role === "watcher");
  const role = $derived(isSpeaker ? "speaker" : isWatcher ? "watcher" : "answerer");
  const speakerSecret = $derived(isSpeaker ? (secret as SpeakerSecret) : null);
  const watcherSecret = $derived(isWatcher ? (secret as WatcherSecret) : null);

  // 正解の申告は2段階にする。1タップで確定すると、誤タップがそのまま別人への加点になる。
  //
  // 開いた時点のカードidを控える。シートを開いている間に監視役が違反を押すとカードが進むため、
  // 送信時に最新のidを読むと、誰も説明していないカードで加点できてしまう。
  // 控えたidで送れば、サーバのstale_cardが正しく発火して弾かれる
  let sheetOpen = $state(false);
  let sheetCardId = $state<string | null>(null);

  function openSheet(): void {
    sheetCardId = speakerSecret?.card.cardId ?? null;
    sheetOpen = true;
  }

  const answerers = $derived(
    room.players.filter((player) => player.id !== speakerId && player.id !== watcherId),
  );

  function claim(playerId: string): void {
    if (sheetCardId === null) {
      return;
    }
    sendAction(ACTIONS.claimCorrect, { playerId, cardId: sheetCardId });
    sheetOpen = false;
    sheetCardId = null;
  }

  function skip(): void {
    const cardId = speakerSecret?.card.cardId;
    if (cardId === undefined) {
      return;
    }
    sendAction(ACTIONS.skipCard, { cardId });
  }

  function reportViolation(): void {
    const cardId = watcherSecret?.cardId;
    if (cardId === undefined) {
      return;
    }
    sendAction(ACTIONS.reportViolation, { cardId });
  }

  function nameOf(playerId: string): string {
    return room.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  // 説明タイムは全員が画面を見ない時間が続く。消えると自分の番で解除から始まる（基本設計/02）
  $effect(() => acquireWakeLock());
</script>

<main class="explaining" class:speaker={role === "speaker"} class:watcher={role === "watcher"}>
  <StageTimer deadline={room.deadline} label={stageLabels[STAGES.explaining]} />

  {#key publicState.solvedThisRound}
    <p class="solved beb-pop" data-testid="solved-count">成立 {publicState.solvedThisRound}枚</p>
  {/key}

  <div class="body">
    {#if publicState.constraint}
      <p class="constraint" data-testid="constraint">
        <span class="constraint-tag">説明者への条件</span>
        <span class="constraint-ja">{publicState.constraint.ja}</span>
        <span class="constraint-en">{publicState.constraint.en}</span>
      </p>
    {/if}
    <StageGuide step="explaining" {role} />

    <!-- 説明者: 人物名を最大に置き、その下に禁止語を赤地で並べる -->
    {#if role === "speaker" && speakerSecret}
      <p class="answer" data-testid="answer">{speakerSecret.card.answer}</p>

      <ul class="taboo">
        {#each speakerSecret.card.taboo as word (word)}
          <li>{word}</li>
        {/each}
      </ul>

      <div class="actions">
        <button class="beb-btn red" onclick={openSheet}>
          <span>正解</span>
        </button>
        <button class="beb-btn ghost" onclick={skip} disabled={publicState.skipUsedThisRound}>
          <span>{publicState.skipUsedThisRound ? "スキップ済み" : "スキップ（1回）"}</span>
        </button>
      </div>

      <!-- 監視役は禁止語を見ているため、当てても加点しない（基本設計/09） -->
      {#if sheetOpen}
        <div class="sheet" data-testid="claim-sheet">
          <p class="sheet-title">だれが当てた？</p>
          <ul class="who">
            {#each answerers as player (player.id)}
              <li>
                <button class="beb-btn blue" onclick={() => claim(player.id)}>
                  <span>{player.name}</span>
                </button>
              </li>
            {/each}
          </ul>
          <button class="beb-btn ghost" onclick={() => ((sheetOpen = false), (sheetCardId = null))}>
            <span>閉じる</span>
          </button>
        </div>
      {/if}

      <!-- 監視役: 正解を「言ったら違反」として出し、その下に禁止語を大きく並べる -->
    {:else if role === "watcher" && watcherSecret}
      <p class="watched-answer" data-testid="watched-answer">
        <span class="watched-label">言ったら違反</span>
        <span class="watched-value">{watcherSecret.answer}</span>
      </p>

      <ul class="taboo big">
        {#each watcherSecret.taboo as word (word)}
          <li>{word}</li>
        {/each}
      </ul>

      <div class="actions">
        <button class="beb-btn yellow" onclick={reportViolation}>
          <span>違反</span>
        </button>
      </div>

      <!-- 回答者: 手元に読むものを増やさない。声を聞かせるために情報を削る -->
    {:else}
      <p class="listen">声を聞いてください</p>
      <div class="speaker-now">
        <span class="face" style={`background:${faceColor(speakerId ?? "")}`}></span>
        <span class="name">{speakerId === undefined ? "" : nameOf(speakerId)}</span>
      </div>
      <ul class="prompts">
        {#each ANSWERER_PROMPTS as prompt (prompt)}
          <li>{prompt}</li>
        {/each}
      </ul>
    {/if}
  </div>
</main>

<style>
  .explaining {
    position: relative;
    min-height: 100vh;
    background: linear-gradient(180deg, #101838, var(--ground));
    color: var(--panel);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
  }
  /* 役の色は斜めに切った帯で出す（投票画面の赤青分割と同じ文法） */
  /* 地の帯は背面へ回す。子側にz-indexを指定すると、タイマーバーのstickyを潰す */
  .explaining::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 42vh;
    clip-path: polygon(0 0, 100% 0, 100% 72%, 0 100%);
    background: var(--blue-deep);
    z-index: -1;
  }
  .explaining.speaker::before {
    background: var(--red-deep);
  }
  .explaining.watcher::before {
    background: #4a3a06;
  }

  .body {
    display: flex;
    flex-direction: column;
    padding: 0.6rem 0.9rem calc(0.9rem + var(--footer-clearance));
  }

  .solved {
    margin: 0;
    padding: 0.3rem 0.9rem;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
    font-variant-numeric: tabular-nums;
  }

  .constraint {
    display: grid;
    gap: 0.1rem;
    margin: 0 0 0.7rem;
    background: var(--yellow);
    color: var(--ink);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.7rem;
  }
  .constraint-tag {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.62rem;
    letter-spacing: 0.1em;
  }
  .constraint-ja {
    font-size: 0.86rem;
    font-weight: 700;
  }
  .constraint-en {
    font-size: 0.76rem;
  }

  .answer {
    font-family: var(--font-display);
    font-size: 2.4rem;
    line-height: 1.15;
    margin: 0.2rem 0 0.8rem;
    text-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
    word-break: break-word;
  }

  .taboo {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .taboo li {
    background: var(--red);
    color: var(--panel);
    border: 2px solid rgba(0, 0, 0, 0.25);
    border-radius: var(--radius-tile);
    padding: 0.4rem 0.7rem;
    font-size: 1.05rem;
    font-weight: 700;
  }
  .taboo.big li {
    font-size: 1.35rem;
    padding: 0.55rem 0.8rem;
  }

  .watched-answer {
    display: grid;
    gap: 0.15rem;
    margin: 0.2rem 0 0.8rem;
    background: var(--ground-2);
    border: 3px solid var(--yellow);
    border-radius: var(--radius-card);
    padding: 0.7rem 0.9rem;
  }
  .watched-label {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
  }
  .watched-value {
    font-family: var(--font-display);
    font-size: 1.6rem;
    line-height: 1.2;
    word-break: break-word;
  }

  .actions {
    display: grid;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    background: var(--ground-2);
    border-top: 4px solid var(--yellow);
    border-radius: var(--radius-card) var(--radius-card) 0 0;
    padding: 0.9rem 0.9rem calc(0.9rem + var(--footer-clearance));
    box-shadow: var(--shadow-hard);
  }
  .sheet-title {
    margin: 0 0 0.6rem;
    font-family: var(--font-display);
    font-size: 1.1rem;
  }
  .who {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }

  .listen {
    margin: 0.4rem 0 0.8rem;
    font-family: var(--font-display);
    font-size: 1.5rem;
    transform: skew(var(--skew-angle));
    transform-origin: left bottom;
  }
  .speaker-now {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: var(--ground-2);
    border: 2px solid var(--blue);
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.7rem;
  }
  .speaker-now .face {
    display: block;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.3);
  }
  .speaker-now .name {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 1.05rem;
  }

  .prompts {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .prompts li {
    background: rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--blue);
    border-radius: 0 var(--radius-tile) var(--radius-tile) 0;
    padding: 0.4rem 0.7rem;
    font-size: 0.95rem;
    font-weight: 700;
  }
</style>
