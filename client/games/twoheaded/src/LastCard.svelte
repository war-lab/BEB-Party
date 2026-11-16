<!--
  直前に終えたお題の答え（16の公開状態の lastCard）。

  当てる側はお題を知らないため、言えない語を言ったかをその場で判断できない。終えたお題の答えを全員に出し、
  後から気付けるようにする。正解なら当てたペアも出す。不自然な申告は場の全員に見える（16の「最初に当てた」の判定）。
-->
<script lang="ts">
  import { pairLabelOf, type RevealedCard, type TeamPublic } from "@beb/shared-twoheaded";

  interface Props {
    card: RevealedCard | null;
    teams: TeamPublic[];
  }
  let { card, teams }: Props = $props();
</script>

{#if card}
  <section class="last beb-pop" data-testid="last-card" data-outcome={card.outcome}>
    <p class="tag">直前のお題</p>
    <p class="answer"><span class="en">{card.answer}</span><span class="ja">{card.ja}</span></p>
    <p class="outcome">
      {card.outcome === "solved" ? `正解: ${pairLabelOf(teams, card.guessedTeamId)}が当てた` : "送った"}
    </p>
  </section>
{/if}

<style>
  .last {
    background: var(--ground-2);
    border: 2px solid var(--outline-neutral);
    border-radius: var(--radius-tile);
    padding: 0.45rem 0.7rem;
    margin: 0.8rem 0 0;
  }
  .tag {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
  }
  .answer {
    margin: 0.15rem 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
  }
  .en {
    font-family: var(--font-display);
    font-size: 1.2rem;
    word-break: break-word;
  }
  .ja {
    font-size: 0.82rem;
    color: var(--mist);
  }
  .outcome {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 700;
  }
</style>
