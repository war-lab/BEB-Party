<!--
  TWO-HEADED SPEAKERの遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/基本設計/16_TWOHEADEDゲームモジュール.md であり、ここはその表示である。
  数値（締切・消費上限・持ち時間）を変えるときは正本と揃える。
-->
<script lang="ts">
  import { MAX_CARDS_PER_TURN, STAGE_DEADLINE_SECONDS, TURN_SECONDS } from "@beb/shared-twoheaded";
</script>

<h3>目的</h3>
<p>
  6〜8人で、2人ずつのペアに分かれて競う。説明役のペアは英語を1語ずつ交互に声に出してお題を説明し、
  ほかのペアが声で当てる。当てたペアと説明役のペアに1点ずつ入る。7人のときは3人のペアが1つでき、3人で順に話す。
</p>

<h3>進み方</h3>
<ol>
  <li><strong>遊び方の確認</strong>（{STAGE_DEADLINE_SECONDS.briefing}秒）: ペアと規則を確かめて「準備できた」を押す</li>
  <li><strong>交代</strong>（{STAGE_DEADLINE_SECONDS.handoff}秒）: 説明役のペアがお題を開いて2人で読み、話す順を確かめて「はじめる」を押す</li>
  <li>
    <strong>説明タイム</strong>（既定{TURN_SECONDS.default}秒）: 1語ずつ交互に説明する。当たったら説明役のペアが「正解」を押し、
    最初に当てたペアを選ぶ。説明しにくいお題は「送る」で次へ進める。正解と送りを合わせて{MAX_CARDS_PER_TURN}回で手番が終わる
  </li>
  <li>全ペアが説明役を務めたら1周。既定は2周で、<strong>結果</strong>で得点と使ったお題を振り返る</li>
</ol>

<h3>話す順</h3>
<p>
  画面に最初に話す人を大きく出す。お題ごとに最初の人が入れ替わる。1語ごとに画面を操作する必要はない。
</p>

<h3>交互の違反</h3>
<ul>
  <li>1人が続けて2語以上言う、相方の番に言う、ペアで相談する（日本語も）のは違反</li>
  <li>気付いた人は <em>Two words!</em> などと声で指摘する。説明役のペアは言いかけの文を捨て、話す順の先頭から言い直す</li>
  <li>判定に迷ったらセーフ。身振りは違反にしない</li>
</ul>

<h3>言えない語</h3>
<ul>
  <li>お題の名前と、その中の語（<em>vending machine</em> の <em>vending</em>、<em>toothbrush</em> の <em>tooth</em>）</li>
  <li>画面に出る別名（<em>refrigerator</em> の <em>fridge</em>）と、これらの複数形・過去形・ing形</li>
  <li>日本語名を口に出すこと</li>
</ul>
<p>言ってしまったら、そのお題は「送る」で捨てる。終えたお題の答えは全員の画面に出る。</p>

<h3>答え方</h3>
<ul>
  <li>答えは英語で声に出す。日本語読み・語順違い・広く通じる通称でも、お題を一意に指していれば正解</li>
  <li>最初に当てたペアは説明役のペアが決める。ほぼ同時なら、先に聞こえたと判断した方とする</li>
  <li>説明役の画面をほかのペアに見せない</li>
</ul>
