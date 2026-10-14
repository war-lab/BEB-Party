<!--
  SECRET RULE ENGLISHの遊び方。共通コアの「遊び方」画面から動的importされる。

  ルールの正本は docs/基本設計/14_SECRETRULEゲームモジュール.md であり、ここはその表示である。
  数値（締切・ラウンド数・試す英文の数・語数）を変えるときは正本と揃える。
-->
<script lang="ts">
  import {
    CANDIDATE_COUNT,
    MAX_ROUNDS,
    MIN_WORDS,
    STAGE_DEADLINE_SECONDS,
    TESTS_PER_ROUND,
    WRITING_SECONDS,
  } from "@beb/shared-secretrule";
</script>

<h3>目的</h3>
<p>
  2〜6人で協力して、英文が「通る」秘密の規則を見抜く。
  候補は画面に{CANDIDATE_COUNT}つ出ていて、そのうち1つが正解。英文を書いて試し、通ったかどうかから規則を絞る。
</p>

<h3>進み方</h3>
<ol>
  <li><strong>候補の確認</strong>（{STAGE_DEADLINE_SECONDS.briefing}秒）: {CANDIDATE_COUNT}つの候補と、語の数え方を読む</li>
  <li><strong>下書き</strong>（既定{WRITING_SECONDS.default}秒）: 全員が英文を1つ書く（{MIN_WORDS}語以上）</li>
  <li>
    <strong>試す英文を選ぶ</strong>（{STAGE_DEADLINE_SECONDS.choosing}秒）: 全員の下書きから、試す{TESTS_PER_ROUND}つを相談して印を付ける。2人のときは飛ばす
  </li>
  <li>
    <strong>報告と回答</strong>（{STAGE_DEADLINE_SECONDS.checking}秒）: 試した英文が通ったかどうかは、書いた本人にだけ見える。
    英語で伝え合い、規則だと思う候補を選ぶ
  </li>
  <li>これを最大{MAX_ROUNDS}ラウンド繰り返す</li>
  <li><strong>規則を使って書く</strong>: 正解したら、その規則を満たし、指定されたもう1つの候補は満たさない英文を全員が書く</li>
</ol>

<h3>答え方</h3>
<p>
  候補を選んだ人の選択が1つに揃った状態でラウンドを終えると、それが答えになる。
  選んでいない人は棄権として扱う。選択が割れていると、そのラウンドは答えない。
  答えられるのは1ラウンドに1回で、まちがえた候補はもう選べない。
</p>

<h3>コツ</h3>
<ul>
  <li>報告は <em>Mine passed.</em> / <em>Mine failed.</em> で足りる</li>
  <li>2つの候補を見分けられる英文を狙って書く。例えば「? で終わるか」を確かめたいなら、ほかの条件はそろえて ? だけ変える</li>
  <li><em>I'm</em> や <em>I've</em> は <em>I</em> とは別の語、<em>black-and-white</em> は1語として扱う。数字も1語に数え、記号だけの部分は数えない</li>
</ul>

<h3>守ること</h3>
<ul>
  <li>自分の画面をほかの人に見せない。見せると英語で伝える意味がなくなる</li>
</ul>

<h3>ランク</h3>
<p>
  何ラウンド目で正解したか、まちがえた回数、最後の英文が何人通ったかでランク（S〜C）が決まる。
  2ラウンド目までにまちがえずに正解し、最後の英文が全員通るとS。
</p>
