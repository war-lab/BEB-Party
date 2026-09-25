<!--
  ESCAPE CALLの遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/基本設計/13_ESCAPECALLゲームモジュール.md であり、ここはその表示である。
  数値（締切・錠の数・桁数）を変えるときは正本と揃える。
-->
<script lang="ts">
  import { ESCAPE_SECONDS, LOCK_COUNT, LOCK_SPECS, STAGE_DEADLINE_SECONDS } from "@beb/shared-escapecall";
</script>

<h3>目的</h3>
<p>
  2〜4人で協力して、{LOCK_COUNT}つの錠を順に開けて脱出する。
  錠の手がかりはばらばらに配られ、自分の画面にだけ出る。英語で伝え合って、数字の答えを組み立てる。
</p>

<h3>手がかりは3種類</h3>
<ul>
  <li><strong>錠の記号</strong>: 錠に描かれた記号の並び（左から右）</li>
  <li><strong>数字の表</strong>: 記号ごとの数字（例: 赤い星 → 3）</li>
  <li><strong>規則</strong>: 並びの読み方を変える英語の指示（例: <em>Skip the black ones.</em>）</li>
</ul>
<p>
  答えは「並びを規則のとおりに読み、表で数字に置き換える」と決まる。
  錠が進むほど規則が増え、3つ目の錠は{LOCK_SPECS[2]?.codeLength}桁になる。
</p>

<h3>進み方</h3>
<ol>
  <li><strong>作戦会議</strong>（{STAGE_DEADLINE_SECONDS.briefing}秒）: 色と形の英語名を確認する</li>
  <li>
    <strong>解錠</strong>（既定{ESCAPE_SECONDS.default / 60}分）: 手がかりを英語で伝え合い、答えを入力する。
    だれが入力してもよい
  </li>
  <li><strong>ふりかえり</strong>: 3つの錠の答えと、全員の手がかりが出る</li>
</ol>

<h3>コツ</h3>
<ul>
  <li>記号は <em>red star</em> のように「色 + 形」で言う</li>
  <li>順番は <em>first</em> / <em>next</em> / <em>last</em> で伝える</li>
  <li>入力する前に <em>Let me check. Four, seven, one, two?</em> と読み上げて確かめる</li>
</ul>

<h3>守ること</h3>
<ul>
  <li>自分の画面をほかの人に見せない。見せると英語で伝える意味がなくなる</li>
  <li>手がかりは英語で伝える</li>
</ul>

<h3>ヒントとランク</h3>
<p>
  詰まったら、ホストがヒントを押すと答えが左から1桁ずつ開く（最後の1桁は開かない）。
  脱出の成否、ヒントの回数、まちがえた回数でランク（S〜D）が決まる。まちがえても時間は減らない。
</p>
