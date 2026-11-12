<!--
  MIND MELDの遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/基本設計/15_MINDMELDゲームモジュール.md であり、ここはその表示である。
  数値（締切・お題の数・試行の上限・点数）を変えるときは正本と揃える。
-->
<script lang="ts">
  import { BRIEFING_SECONDS, INPUT_SECONDS, MAX_ATTEMPTS, MAX_ROUNDS, REVEAL_SECONDS } from "@beb/shared-mindmeld";
</script>

<h3>目的</h3>
<p>
  4〜8人で、2人ずつのペアに分かれて競う。お題に合う英単語をペアの2人が同時に出し、同じ語にそろえる。
  少ない回数でそろうほど点が高く、{MAX_ROUNDS}つのお題の合計点で勝敗を決める。
  5人と7人のときは3人のチームが1つでき、毎回2人が語を出して交代する。
</p>

<h3>進み方</h3>
<ol>
  <li><strong>遊び方の確認</strong>（{BRIEFING_SECONDS}秒）: チームと約束を確かめる</li>
  <li><strong>語を出す</strong>（既定{INPUT_SECONDS.default}秒）: お題に合う英単語を1つ入力する。語や手がかりは口に出さない</li>
  <li>
    <strong>開示</strong>（{REVEAL_SECONDS}秒）: 全員で <em>Three, two, one!</em> と数え、one に合わせて自分の語を声に出す。
    画面に全チームの語が出る
  </li>
  <li>そろわなかったら、2人が出した2語の両方につながる1語を出す。1つのお題で{MAX_ATTEMPTS}回まで</li>
</ol>

<h3>点数</h3>
<p>1回目でそろうと{MAX_ATTEMPTS}点、2回目は{MAX_ATTEMPTS - 1}点、{MAX_ATTEMPTS}回目は1点。{MAX_ATTEMPTS}回でそろわなければ0点。</p>

<h3>出せない語</h3>
<ul>
  <li>お題の英文の中の語</li>
  <li>そのお題でもう開示された語。自分のペアの語だけでなく、ほかのペアの語も出せない</li>
</ul>

<h3>近い語の申告</h3>
<p>
  <em>apple</em> と <em>apples</em>、<em>color</em> と <em>colour</em> のように少しだけ違う2語は、ペアが「同じ語」と申告できる。
  ほかのチームの人は、別の語だと思えば異議を出す。異議がほかのチームの人数の半分を超えると申告は認められない。
  複数形、つづりの英米差、1〜2文字の打ち間違いは同じ語として認め、意味の違う語は認めない。
</p>

<h3>守ること</h3>
<ul>
  <li>語を出している間は、出す語やその手がかりを口に出さない</li>
  <li>そろわなかったら、なぜその語にしたかを英語で言い合ってみる（<em>Why did you say that?</em>）</li>
</ul>
