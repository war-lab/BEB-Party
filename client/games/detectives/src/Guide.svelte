<!--
  ENGLISH DETECTIVESの遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/構想v2.md と docs/基本設計/08_DETECTIVESゲームモジュール.md であり、
  ここはその表示である。数値（締切・レベル別制約）を変えるときは正本と揃える。
-->
<script lang="ts">
  import { CONSTRAINTS, INVESTIGATION_SECONDS, STAGE_DEADLINE_SECONDS } from "@beb/shared-detectives";
  import type { Level } from "@beb/shared-core";

  const LEVELS: Level[] = [1, 2, 3, 4, 5];
  const CARD_SHAPES: Record<Level, string> = {
    1: "単語・数字・Yes/No",
    2: "短い文",
    3: "日常会話の文",
    4: "遠回しな表現・条件付きの記憶",
    5: "曖昧・伝聞・複文",
  };

  const investigationMinutes = INVESTIGATION_SECONDS.default / 60;
</script>

<h3>目的</h3>
<p>
  全員が事件の関係者になる。1人だけが犯人で、犯人の証言には嘘が1枚だけ混ざっている。
  市民は犯人を当てれば勝ち、犯人は逃げ切れば勝ち。
</p>

<h3>進み方</h3>
<ol>
  <li><strong>ブリーフィング</strong>（{STAGE_DEADLINE_SECONDS.briefing}秒）: 事件の概要を読み、自分の役柄を確認して「準備できた」を押す</li>
  <li><strong>捜査</strong>（既定{investigationMinutes}分）: 英語で質問し合う。ホストは早めに切り上げられる</li>
  <li><strong>投票</strong>（{STAGE_DEADLINE_SECONDS.voting}秒）: 犯人だと思う人へ投票する</li>
  <li><strong>開示</strong>: 犯人・嘘の証言・矛盾・真相が表示される</li>
</ol>

<h3>証言カード</h3>
<ul>
  <li>自分のカードは自分にしか見えない。他人に画面を見せない</li>
  <li>読み上げるのは英文のほう。日本語は単語の意味だけを書いてある</li>
  <li>「聞かれたときだけ答える」と書かれたカードは、自分からは話さない</li>
  <li>犯人には「この証言は嘘」と表示されたカードが1枚ある</li>
</ul>

<h3>推理のしかた</h3>
<p>
  嘘は1人の証言だけでは割れない。犯人以外の2人以上の証言を突き合わせて、はじめて矛盾が現れる。
  誰か1人が黙っていると真相に届かないため、全員から話を引き出す。
</p>

<h3>レベル別のきまり</h3>
<table>
  <thead>
    <tr><th>レベル</th><th>証言の形</th><th>守ること</th></tr>
  </thead>
  <tbody>
    {#each LEVELS as level (level)}
      <tr>
        <td>{level}</td>
        <td>{CARD_SHAPES[level]}</td>
        <td>{CONSTRAINTS[level].join(" / ")}</td>
      </tr>
    {/each}
  </tbody>
</table>
<p class="note">レベル1〜2には質問の例文が表示される。読み上げて使う。</p>

<h3>投票と勝敗</h3>
<ul>
  <li>自分には投票できない。投票は1回きりで、あとから変えられない</li>
  <li>最多票が犯人と一致すれば市民の勝ち</li>
  <li>票が割れて同数で並んだ場合は犯人の勝ちとする</li>
  <li>締切までに投票しなかった人は棄権として数えない</li>
</ul>

<style>
  h3 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 1rem;
    margin: 1.25rem 0 0.4rem;
  }
  p,
  li {
    line-height: 1.8;
  }
  ul,
  ol {
    padding-left: 1.2rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th,
  td {
    border: 1px solid rgba(22, 27, 51, 0.25);
    padding: 0.3rem 0.5rem;
    text-align: left;
    vertical-align: top;
  }
  .note {
    font-size: 0.85rem;
  }
</style>
