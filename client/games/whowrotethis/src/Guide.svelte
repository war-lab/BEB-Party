<!--
  WHO WROTE THIS?の遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/基本設計/11_WHOWROTETHISゲームモジュール.md であり、ここはその表示である。
  数値（締切・ラウンド数・得点・語数）を変えるときは正本と揃える。
-->
<script lang="ts">
  import {
    MAX_CHARS,
    MIN_WORDS,
    POINTS_PER_CORRECT_GUESS,
    POINTS_PER_HIDDEN,
    ROUNDS,
    STAGE_DEADLINE_SECONDS,
    WRITING_SECONDS,
  } from "@beb/shared-whowrotethis";
</script>

<h3>目的</h3>
<p>
  全員が同じ質問に英語で1文だけ答える。
  提出は名前を伏せて1件ずつ出るので、誰が書いた文かを当てる。
</p>
<p>
  当たれば{POINTS_PER_CORRECT_GUESS}点。
  自分の文を誰にも当てられなければ{POINTS_PER_HIDDEN}点入る。
</p>

<h3>進み方</h3>
<ol>
  <li><strong>質問の確認</strong>（{STAGE_DEADLINE_SECONDS.briefing}秒）: 質問と、自分に配られた言い方の例を読む</li>
  <li>
    <strong>英作文</strong>（既定{WRITING_SECONDS.default}秒）: 質問への答えを英語で書いて出す。
    {MIN_WORDS}語以上、{MAX_CHARS}文字まで。締切までは書き直せる
  </li>
  <li>
    <strong>作者当て</strong>（1件{STAGE_DEADLINE_SECONDS.guessing}秒）: 出た文を読み、誰が書いたかを英語で言い合ってから席を選ぶ。
    自分の文が出ているときは指名できない
  </li>
  <li><strong>答え合わせ</strong>（{STAGE_DEADLINE_SECONDS.judging}秒）: 作者と、誰が誰を指名したかが出る</li>
  <li><strong>開示</strong>: そのラウンドの提出と得点が出る</li>
</ol>
<p>作者当てと答え合わせを提出の件数だけくり返し、これを{ROUNDS}ラウンド行う。質問はラウンドごとに変わる。</p>

<h3>コツ</h3>
<ul>
  <li>自分らしい言い方をすると当てられる。いつもと違う書き方をすると隠れやすい</li>
  <li>当てる側は文の中身より「その人が言いそうか」を見る。話し合いは英語で行う</li>
  <li>後の方に出る文は、作者がすでに分かった人を除いていくと絞れる</li>
</ul>

<h3>守ること</h3>
<ul>
  <li>自分の画面を他人に見せない。書いている途中の文が見えると当て合いが成立しない</li>
  <li>「これは自分の文だ」と口で言わない。隠し通せば点になる</li>
  <li>読めない文・場が止まる内容を書かない。アプリは中身を判定しない</li>
</ul>

<h3>得点</h3>
<ul>
  <li>指名が当たれば{POINTS_PER_CORRECT_GUESS}点。外しても減点はない</li>
  <li>自分の文を誰にも当てられなければ{POINTS_PER_HIDDEN}点</li>
  <li>6人なら1ラウンドで最大6点、{ROUNDS}ラウンドで最大12点になる</li>
</ul>
