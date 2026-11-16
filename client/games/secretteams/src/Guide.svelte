<!--
  SECRET TEAMSの遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/基本設計/17_SECRETTEAMSゲームモジュール.md であり、ここはその表示である。
  数値（締切・周回数・選択肢の数・配点）を変えるときは正本と揃える。
-->
<script lang="ts">
  import {
    ANSWERING_SECONDS,
    BRIEFING_SECONDS,
    CLUE_SECONDS,
    LAPS,
    SCORE_WEIGHTS,
    THEME_CHOICE_COUNT,
  } from "@beb/shared-secretteams";
</script>

<h3>目的</h3>
<p>
  4〜8人が2チームに分かれて競う。各チームにはテーマ（<em>Ocean</em> など）が1つあり、各自にはそのテーマの英単語が1つずつ配られる。
  <strong>誰が味方かは知らされない。</strong>自分の単語を英語で遠回しに説明し合い、味方と相手チームのテーマを見抜く。
</p>

<h3>進み方</h3>
<ol>
  <li><strong>遊び方の確認</strong>（{BRIEFING_SECONDS}秒）: 自分の単語とテーマ、テーマの選択肢{THEME_CHOICE_COUNT}件、説明の順番を確かめる</li>
  <li>
    <strong>説明</strong>（1人 既定{CLUE_SECONDS.default}秒）: 順番に自分の単語を英語で説明する。{LAPS}周する。
    聞いている人は英語で質問してよい（<em>Can you eat it?</em>）
  </li>
  <li>
    <strong>回答</strong>（{ANSWERING_SECONDS}秒）: 相談しながら、味方だと思う人と相手チームのテーマを伏せて選ぶ。締切まで直せる
  </li>
  <li><strong>結果</strong>: チームの得点、全員の単語と回答を見る</li>
</ol>

<h3>選択肢</h3>
<p>
  選択肢{THEME_CHOICE_COUNT}件には、両チームの本物のテーマと、それぞれに近いテーマ（<em>River</em>、<em>Lake</em> など）が混ざっている。
  味方は自分のテーマに合うかだけを確かめればよいが、相手は近いテーマのどれかを決めきれない。味方にだけ伝わる言い方を探す。
</p>

<h3>点数</h3>
<ul>
  <li>合流率: 各自「正しく選んだ味方の数 − 誤って選んだ相手の数」を味方の人数で割った値（0未満は0）のチーム平均</li>
  <li>見抜き率: 相手チームのテーマを当てた人の割合</li>
  <li>チームの得点 = 合流率 × {SCORE_WEIGHTS.join} + 見抜き率 × {SCORE_WEIGHTS.spot}（100点満点）。高いチームの勝ち</li>
  <li>回答しなかった人と途中で抜けた人は0として数える</li>
</ul>

<h3>守ること</h3>
<ul>
  <li>自分の単語とテーマ名はそのまま言わない</li>
  <li>自分の画面を他の人に見せない</li>
</ul>
