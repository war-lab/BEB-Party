<!--
  ENGLISH RANKINGの遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/基本設計/10_ENGLISHRANKINGゲームモジュール.md であり、ここはその表示である。
  数値（締切・ラウンド数・得点）を変えるときは正本と揃える。
-->
<script lang="ts">
  import { DISCUSSION_SECONDS, POINTS_PER_GOAL, ROUNDS, STAGE_DEADLINE_SECONDS } from "@beb/shared-ranking";
</script>

<h3>目的</h3>
<p>
  5つの項目を英語で話し合い、1位から5位まで並べる。
  自分だけに配られる秘密の目標（たとえば「sleepを2位以内に入れる」）が、確定した順位で通っていれば{POINTS_PER_GOAL}点入る。
</p>
<p>順位は卓の合意で決める。話して他の人を動かせないと目標は通らない。</p>

<h3>進み方</h3>
<ol>
  <li><strong>目標の確認</strong>（{STAGE_DEADLINE_SECONDS.briefing}秒）: 伏せ面をタップして自分の目標を開き、「かくにんした」を押す</li>
  <li><strong>議論</strong>（既定{DISCUSSION_SECONDS.default}秒）: 英語で順位を話し合う。画面には自分の目標と言い方の例が出ている</li>
  <li><strong>順位の確定</strong>（{STAGE_DEADLINE_SECONDS.confirming}秒）: ホストが決まった順位を並べ、全員が承認すると確定する</li>
  <li><strong>開示</strong>: 確定した順位と全員の目標、達成の可否が出る</li>
</ol>
<p>これを{ROUNDS}ラウンドくり返す。ラウンドごとに項目と目標は入れ替わる。</p>

<h3>目標の難しさはレベルで変わる</h3>
<p>目標には3段階の難しさがあり、英語レベルの高い人から順に難しいものが配られる。</p>
<table>
  <thead>
    <tr><th>難しさ</th><th>目標の形</th></tr>
  </thead>
  <tbody>
    <tr><td>やさしい</td><td>「AをBより上にする」「Aを2位以内に入れる」</td></tr>
    <tr><td>ふつう</td><td>「Aを1位にする」「Aを最下位にする」</td></tr>
    <tr><td>むずかしい</td><td>「Aをちょうど3位にする」</td></tr>
  </tbody>
</table>
<p>レベル1〜2の人には、目標を主張するための英文の例が3つ渡される。</p>

<h3>守ること</h3>
<ul>
  <li>自分の画面を他人に見せない。目標が割れると駆け引きが成立しない</li>
  <li>議論は英語で行う。目標そのものを日本語で言わない</li>
  <li>「自分の目標はこれだ」と明かしてもよい。信じてもらえるかは別の話である</li>
  <li>ホストは卓で決まった順位を入れる。違うと思ったら承認せずに口で言う</li>
</ul>

<h3>得点</h3>
<ul>
  <li>目標が通れば{POINTS_PER_GOAL}点。通らなければ0点。減点はない</li>
  <li>同じラウンドで何人が達成してもよい。全員の目標が同時に通ることはない作りになっている</li>
  <li>{ROUNDS}ラウンドの合計で競う。取り得る点は0点から{ROUNDS * POINTS_PER_GOAL}点である</li>
</ul>
