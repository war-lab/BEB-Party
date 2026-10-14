<!--
  候補6件の一覧（基本設計/14の画面）。

  番号は「Number three?」と口で指すためのものであり、規則の中身を表さない。
  日本語の補足は、自分のレベルが1〜2なら常に開き、3〜5なら折りたたむ（14のレベル差の吸収の第3層）。
  選ぶ操作は候補を読む操作と分け、読むためのタップで選択が入らないようにする（14の「回答はラウンドの終わりに判定する」）。
  英文に対する候補の成否は計算しない（14の「候補を自動で消さない」）。
-->
<script lang="ts">
  import { faceColor, playerIconOf } from "@beb/client-core";
  import type { CandidatePublic, Selection } from "@beb/shared-secretrule";

  interface Props {
    candidates: CandidatePublic[];
    /** 自分のレベル。日本語の補足を常に開くかを決める */
    myLevel: number;
    /** checking の選択。誰がどの候補を推しているかを顔で示す */
    selections?: Selection[];
    /** 誤答済みの候補。打ち消し線で示し、選べなくする */
    eliminatedIds?: string[];
    /** 選ぶ操作を出すか */
    selectable?: boolean;
    mySelection?: string | null;
    onSelect?: (candidateId: string | null) => void;
    /** proving 以降に強調する正解の候補と避ける候補 */
    solvedId?: string | null;
    avoidId?: string | null;
  }
  let {
    candidates,
    myLevel,
    selections = [],
    eliminatedIds = [],
    selectable = false,
    mySelection = null,
    onSelect,
    solvedId = null,
    avoidId = null,
  }: Props = $props();

  // レベル3以上は折りたたむ。開いた状態は画面の中でだけ持つ
  let showJaManually = $state(false);
  const showJa = $derived(myLevel <= 2 || showJaManually);

  function supporters(candidateId: string): string[] {
    return selections.filter((entry) => entry.candidateId === candidateId).map((entry) => entry.playerId);
  }

  function toggle(candidateId: string): void {
    onSelect?.(mySelection === candidateId ? null : candidateId);
  }
</script>

<section class="candidates" data-testid="candidate-list">
  <header>
    <h2>規則の候補</h2>
    {#if myLevel > 2}
      <button class="ja-toggle" onclick={() => (showJaManually = !showJaManually)} data-testid="toggle-ja">
        {showJa ? "日本語を隠す" : "日本語を見る"}
      </button>
    {/if}
  </header>
  <ol>
    {#each candidates as candidate, index (candidate.id)}
      {@const eliminated = eliminatedIds.includes(candidate.id)}
      <li
        class:eliminated
        class:solved={candidate.id === solvedId}
        class:avoid={candidate.id === avoidId}
        class:mine={candidate.id === mySelection}
        data-testid="candidate"
        data-candidate-id={candidate.id}
      >
        <span class="number">{index + 1}</span>
        <span class="text">
          <span class="en">{candidate.textEn}</span>
          {#if showJa}<span class="ja">{candidate.textJa}</span>{/if}
          {#if candidate.id === solvedId}<span class="tag">正解の規則</span>{/if}
          {#if candidate.id === avoidId}<span class="tag avoid-tag">満たさないこと</span>{/if}
        </span>
        {#if selections.length > 0}
          <span class="faces">
            {#each supporters(candidate.id) as playerId (playerId)}
              <span class="face" style={`background:${faceColor(playerId)}`}>
                <span aria-hidden="true">{playerIconOf(playerId)}</span>
              </span>
            {/each}
          </span>
        {/if}
        {#if selectable && !eliminated}
          <button
            class="pick"
            class:on={candidate.id === mySelection}
            onclick={() => toggle(candidate.id)}
            data-testid="select-candidate"
          >
            {candidate.id === mySelection ? "選択中" : "これにする"}
          </button>
        {/if}
      </li>
    {/each}
  </ol>
</section>

<style>
  .candidates {
    margin: 0 0 0.9rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 0 0.35rem;
  }
  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: var(--yellow);
  }
  .ja-toggle {
    background: transparent;
    color: var(--mist);
    border: 2px solid rgba(255, 255, 255, 0.25);
    border-radius: var(--radius-tile);
    padding: 0.15rem 0.5rem;
    font-family: var(--font-body);
    font-size: 0.72rem;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.5rem;
    background: var(--panel);
    color: var(--ink);
    border: var(--outline-width) solid transparent;
    border-radius: var(--radius-tile);
    padding: 0.5rem 0.6rem;
  }
  li.mine {
    border-color: var(--yellow);
  }
  li.solved {
    border-color: var(--yellow);
    background: #fff7d6;
  }
  li.avoid {
    border-color: var(--ink-soft);
  }
  li.eliminated {
    opacity: 0.5;
  }
  li.eliminated .en {
    text-decoration: line-through;
  }
  .number {
    font-family: var(--font-display);
    font-size: 1.2rem;
    min-width: 1.4rem;
    text-align: center;
  }
  .text {
    display: grid;
    gap: 0.1rem;
  }
  .en {
    font-size: 0.95rem;
    line-height: 1.35;
  }
  .ja {
    font-size: 0.74rem;
    color: var(--ink-soft);
  }
  .tag {
    justify-self: start;
    margin-top: 0.15rem;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--ink);
    background: var(--yellow);
    border-radius: var(--radius-tile);
    padding: 0.05rem 0.4rem;
  }
  .avoid-tag {
    background: var(--ink-soft);
    color: var(--panel);
  }
  .faces {
    grid-column: 2 / 3;
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
  }
  .face {
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
  }
  .pick {
    grid-column: 3;
    grid-row: 1 / span 2;
    background: var(--ground-2);
    color: var(--panel);
    border: 2px solid var(--ground-2);
    border-radius: var(--radius-tile);
    padding: 0.35rem 0.55rem;
    font-family: var(--font-body);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .pick.on {
    background: var(--yellow);
    color: var(--ink);
    border-color: var(--yellow);
  }
</style>
