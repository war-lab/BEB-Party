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

<p class="note">
  各ステージの画面上部に「いまやること」が出る。進行役が台本を読む必要はない。
</p>

<h3>捜査で使うことば</h3>
<p>読み上げるのは英文。カッコ内は意味であり、声に出すのは英語のほうとする。</p>

<h4>聞く</h4>
<ul class="phrases">
  <li><b>Where were you at 2:15?</b><span>2時15分にどこにいた？</span></li>
  <li><b>What did you see?</b><span>何を見た？</span></li>
  <li><b>Who were you with?</b><span>誰と一緒だった？</span></li>
  <li><b>What time was that?</b><span>それは何時？</span></li>
  <li><b>Are you sure?</b><span>確か？</span></li>
</ul>

<h4>答える</h4>
<ul class="phrases">
  <li><b>I was in the kitchen.</b><span>厨房にいた</span></li>
  <li><b>At about 2:15.</b><span>2時15分ごろ</span></li>
  <li><b>I saw Aoi.</b><span>アオイを見た</span></li>
  <li><b>I do not remember.</b><span>覚えていない</span></li>
  <li><b>Nobody was there.</b><span>誰もいなかった</span></li>
</ul>

<h4>突き合わせる（レベル3以上）</h4>
<ul class="phrases">
  <li><b>That does not match what Aoi said.</b><span>アオイの話と合わない</span></li>
  <li><b>So you were at the counter the whole time?</b><span>つまり、ずっとカウンターにいた？</span></li>
  <li><b>Aoi says the door was locked. How did you go out?</b><span>アオイは扉が施錠されていたと言っている。どうやって出た？</span></li>
  <li><b>Why did you not say that earlier?</b><span>なぜさっき言わなかった？</span></li>
</ul>

<h3>推理のしかた</h3>
<p>
  嘘は1人の証言だけでは割れない。犯人以外の2人以上の証言を突き合わせて、はじめて矛盾が現れる。
  誰か1人が黙っていると真相に届かないため、全員から話を引き出す。
</p>

<h4>例</h4>
<p>収録事件とは別の、説明用の3枚とする。</p>
<ul class="phrases example">
  <li><b>B: I was in the storeroom at 2:15.</b><span>2時15分に倉庫にいた（Bの証言）</span></li>
  <li><b>C: The storeroom was locked from 2:10.</b><span>倉庫は2時10分から施錠されていた（Cの証言）</span></li>
  <li><b>D: I had the key the whole time.</b><span>鍵はずっと私が持っていた（Dの証言）</span></li>
</ul>
<p>
  Cだけでは「Bが鍵を持っていた」で説明がついてしまう。Dの証言が加わって、はじめてBの居場所が成り立たなくなる。
  これが「2人以上の突き合わせ」である。
</p>

<h3>犯人になったら</h3>
<ul>
  <li>嘘のカードも、他のカードと同じ調子で読み上げる</li>
  <li>聞かれたら答える。黙ると疑われるうえ、卓が真相に届かなくなって面白くならない</li>
  <li>自分からも質問する。聞き役に回ると目立つ</li>
  <li>嘘は1枚だけで、他のカードは本当のことを言っている。嘘を重ねる必要はない</li>
</ul>

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

<h3>開示の読み方</h3>
<ul>
  <li>犯人と、その回の嘘のカードが出る</li>
  <li>「矛盾」は、その嘘を崩していた証言の組み合わせ。誰の証言が効いていたかを見る</li>
  <li>真相のタイムラインで、実際に何が起きたかの順序を確認する</li>
  <li>キーフレーズは、その事件で使われた英語表現。次の回で使い回せる</li>
</ul>

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
  h4 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.85rem;
    margin: 0.9rem 0 0.3rem;
  }
  .phrases {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .phrases li {
    display: flex;
    flex-direction: column;
    border-left: 3px solid var(--blue);
    padding: 0.15rem 0 0.15rem 0.6rem;
    line-height: 1.5;
  }
  .phrases b {
    font-size: 0.95rem;
  }
  .phrases span {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .phrases.example li {
    border-left-color: var(--red);
  }
</style>
