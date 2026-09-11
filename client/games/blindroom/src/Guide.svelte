<!--
  BLIND ROOMの遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/基本設計/12_BLINDROOMゲームモジュール.md であり、ここはその表示である。
  数値（締切・配置数・得点）を変えるときは正本と揃える。
-->
<script lang="ts">
  import { BUILDING_SECONDS, PLACE_COUNT, STAGE_DEADLINE_SECONDS } from "@beb/shared-blindroom";
</script>

<h3>目的</h3>
<p>
  説明者1人だけが見本を見る。
  他の全員は英語の説明を聞いて、同じ並びを自分の盤面に作る。
</p>
<p>合っていたマス1つにつき1点。説明者にはみんなの平均が点になる。当て合いではなく、伝わったかどうかを競う。</p>

<p>
  盤面の広さはホストがロビーで選ぶ。入門 3×3・標準 4×3・上級 4×4 の3種類で、
  置く数（{PLACE_COUNT}個）と時間は変わらない。広いほど位置を細かく伝える必要がある。
</p>

<h3>進み方</h3>
<ol>
  <li><strong>部屋の確認</strong>（{STAGE_DEADLINE_SECONDS.briefing}秒）: このラウンドで使うものの英語名を見る</li>
  <li>
    <strong>説明者の交代</strong>（{STAGE_DEADLINE_SECONDS.handoff}秒）: 説明者だけが見本を開く。
    まわりに画面を見られていないか確認してから開く
  </li>
  <li>
    <strong>配置</strong>（既定{BUILDING_SECONDS.default}秒）: 説明者が英語で伝え、聞き手は{PLACE_COUNT}個を置く。
    聞き手は英語で質問できる。全員が「できた」を押すと早く進む
  </li>
  <li><strong>答え合わせ</strong>（{STAGE_DEADLINE_SECONDS.reveal}秒）: 見本とみんなの盤面が並ぶ</li>
</ol>
<p>説明者を1人ずつ交代し、参加人数と同じ回数くり返す。</p>

<h3>コツ</h3>
<ul>
  <li>先に「どこに何個あるか」を言うと、聞き手が枠を作れる</li>
  <li>
    段は <em>top</em> / <em>middle</em> / <em>bottom</em>（4段のときは
    <em>top</em> / <em>second</em> / <em>third</em> / <em>bottom</em>）、横は <em>left</em> / <em>right</em> で伝える
  </li>
  <li>端でない位置は <em>second from the left</em> のように左から数える</li>
  <li>ものの名前だけでなく、<em>next to</em> や <em>under</em> のような位置の言い方を使う</li>
  <li>聞き手は分からないまま置かない。<em>Which row?</em> と聞けばよい</li>
</ul>

<h3>守ること</h3>
<ul>
  <li>
    マスに番号を振って言わない（<em>x1y3</em>、「3番」など）。
    <em>top row</em> や <em>next to the cat</em> のような位置の言い方で伝える
  </li>
  <li>説明者の画面を他の人が見ない。見えた時点でそのラウンドは成立しない</li>
  <li>説明は英語で行う。ものの名前が出てこないときは、形や色で言い換える</li>
</ul>

<h3>得点</h3>
<ul>
  <li>聞き手は合ったマス1つにつき1点（1ラウンド最大{PLACE_COUNT}点）</li>
  <li>説明者は聞き手が合わせたマス数の平均（切り捨て）が点になる</li>
  <li>置く場所を外しても減点はない。見本にないマスへ置いても点は動かないが、置ける数は{PLACE_COUNT}個までである</li>
</ul>
