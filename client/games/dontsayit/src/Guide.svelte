<!--
  DON'T SAY ITの遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/基本設計/09_DONTSAYITゲームモジュール.md であり、ここはその表示である。
  数値（締切・提示語数）を変えるときは正本と揃える。
-->
<script lang="ts">
  import { ROUND_SECONDS, STAGE_DEADLINE_SECONDS, TABOO_COUNT, TABOO_PER_CARD } from "@beb/shared-dontsayit";
  import type { Level } from "@beb/shared-core";

  const LEVELS: Level[] = [1, 2, 3, 4, 5];
</script>

<h3>目的</h3>
<p>
  説明者が英語で人物を説明し、回答者が言い当てる。ただし説明者には使ってはいけない語が配られる。
  説明者と当てた人の両方に1点入るため、伝わる説明をしたほうが得になる。
</p>

<h3>3つの役</h3>
<ul>
  <li><strong>説明者</strong>: 人物名と禁止語が配られる。禁止語を使うと1点減る</li>
  <li><strong>監視役</strong>: 禁止語と正解が配られる。禁止語か正解そのものを言われたら「違反」を押す。このラウンドは答えない</li>
  <li><strong>回答者</strong>: 声を聞いて人物名を言い当てる。当てると1点</li>
</ul>
<p>役は毎ラウンド1つずつずれる。全員が1回ずつ説明者と監視役を務める。</p>

<h3>進み方</h3>
<ol>
  <li><strong>ルール確認</strong>（{STAGE_DEADLINE_SECONDS.briefing}秒）: 役と得点を確認して「準備できた」を押す</li>
  <li><strong>交代</strong>（{STAGE_DEADLINE_SECONDS.handoff}秒）: 次の説明者がお題を読み、「はじめる」を押す</li>
  <li><strong>説明タイム</strong>（既定{ROUND_SECONDS.default}秒）: 当たるたびに次のお題へ進む。分からないお題は1回だけ飛ばせる</li>
  <li>これを人数分くり返し、<strong>結果</strong>で得点と使ったお題を振り返る</li>
</ol>

<h3>禁止語の数はレベルで変わる</h3>
<p>お題には常に{TABOO_PER_CARD}語の禁止語があり、説明者のレベルに応じて提示する数が変わる。</p>
<table>
  <thead>
    <tr><th>レベル</th><th>使えない語</th><th>追加の条件</th></tr>
  </thead>
  <tbody>
    {#each LEVELS as level (level)}
      <tr>
        <td>{level}</td>
        <td>{TABOO_COUNT[level]}語</td>
        <td>{level >= 5 ? "説明の仕方に条件が1つ付く" : "なし"}</td>
      </tr>
    {/each}
  </tbody>
</table>

<h3>守ること</h3>
<ul>
  <li>自分の画面を他人に見せない</li>
  <li>説明は英語で行う。人物名そのものと、その一部を言わない</li>
  <li>回答は英語でも日本語でもよい。当てるのが目的である</li>
  <li>正解の申告は説明者が行う。誰が当てたかは説明者が選ぶ</li>
</ul>

<h3>禁止語の判定</h3>
<p>
  禁止語は、形を変えても言えません。複数形・過去形・ing形・「〜する人」などは同じ語とみなします
  （glove → gloves、run → running / runner、France → French はすべてアウト）。
</p>
<p>別の単語への言い換えはかまいません（fast → quick、present → gift はセーフ）。</p>
<p>
  監視役へ: 同じ語か別の語か迷ったら、セーフにしてください。ゲームを止めないことを優先します。
</p>

<h3>正解の判定</h3>
<p>
  回答はカードの表記と一致しなくてかまいません。日本語読み・姓または名だけ・姓名の語順違い・広く通じる通称
  （キティちゃん、プーさん等）は、その人物を一意に指していれば正解とします。
  作品名や役割だけの回答（「アナ雪」「鬼滅の主人公」）は、人物を名指ししていないため正解にしません。
</p>

<h3>説明者への条件</h3>
<p>
  レベル5の説明者には、説明の仕方の条件が1つ付きます。条件は全員の画面に出ます。
  守れているかは場の耳で判断し、破っていれば監視役が「違反」を押します。
</p>

<p class="note">
  各ステージの画面上部に「いまやること」が出る。進行役が台本を読む必要はない。
</p>

<h3>当てる側で使うことば</h3>
<ul class="phrases">
  <li><b>Is it a person?</b><span>それは人？</span></li>
  <li><b>Say it again, please.</b><span>もう一度言って</span></li>
  <li><b>One more hint!</b><span>もう1つヒントを</span></li>
  <li><b>Do you mean ...?</b><span>〜ということ？</span></li>
</ul>

<h3>説明する側で使うことば</h3>
<ul class="phrases">
  <li><b>He/She is the one who ...</b><span>〜した人です</span></li>
  <li><b>You see this person in ...</b><span>〜で見かける人です</span></li>
  <li><b>It is a character from ...</b><span>〜に出てくるキャラクターです</span></li>
  <li><b>Not a real person.</b><span>実在の人ではない</span></li>
  <li><b>I can't say that word.</b><span>その語は言えない</span></li>
</ul>

<style>
  h3 {
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
    font-size: 0.86rem;
    letter-spacing: 0.06em;
    color: var(--yellow);
    margin: 1.1rem 0 0.4rem;
  }
  p,
  li {
    font-size: 0.86rem;
    line-height: 1.7;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    border-bottom: 1px solid rgba(255, 255, 255, 0.18);
    padding: 0.3rem 0.4rem;
    text-align: left;
  }
  th {
    color: var(--yellow);
    font-family: var(--font-heading);
    font-weight: var(--font-heading-weight);
  }
  .phrases {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }
  .phrases li {
    display: grid;
    gap: 0.1rem;
    background: rgba(255, 255, 255, 0.08);
    border-left: 4px solid var(--blue);
    border-radius: 0 var(--radius-tile) var(--radius-tile) 0;
    padding: 0.35rem 0.6rem;
  }
  .phrases b {
    font-size: 0.95rem;
  }
  .phrases span {
    font-size: 0.76rem;
    color: var(--mist);
  }
  .note {
    color: var(--mist);
    font-size: 0.8rem;
  }
</style>
