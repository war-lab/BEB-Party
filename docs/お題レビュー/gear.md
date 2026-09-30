# お題レビュー: 持ち物と道具（ranking / gear）

## 結論

お題6セット（項目30件、目標カード36枚、言い回しの例108件、`keyExpressions` 18件）を収録した。
検証14項目とスキーマ検証をすべて通過している。

人手レビューは行っていない。
作成したAIによる自己点検のあと、作成者とは別のAIレビュアー（Claude Opus 5.5）が1巡のレビューを行い、英文7か所、訳2か所、目標カード2枚を直した。
レビュアーは1体であり、DON'T SAY ITのような3観点の独立したクロスレビューではない。

したがって、英文の自然さと場の安全性はAI2体の判断であり、人とネイティブ話者は確認していない。
目標の対立の有無は、レビュアーが120通りの総当たりで全セットを確かめた。

**実プレイは経ていない**。
議論の盛り上がり、目標の通りやすさ、得点分布は未実測であり、未解決の論点に残す。

お題データの正本は `content/ranking/gear.json`、ルールの正本は [基本設計/10](../基本設計/10_ENGLISHRANKINGゲームモジュール.md) である。

## 経緯

| 日付 | 出来事 |
| --- | --- |
| 2026-09-30 | 6セットを収録し、検証14項目を通過。作成AIによる自己点検のみ（クロスレビュー未実施） |
| 2026-09-30 | 作成者と別のAIレビュアーが1巡レビュー。`camping` と `new_room` に両立しない目標の組が無く、5人卓で全員の目標が同時に通りうる欠陥を見つけ、目標を1枚ずつ差し替えた。英文と訳も直し、検証14項目を再度通過 |

## パックの骨格

| 項目 | 内容 |
| --- | --- |
| セット | 6件（検証2の下限6件ちょうど。1ゲームで3セット使う） |
| 項目 | 1セット5件。すべて持ち物または家電であり、同じセット内で役割の近い物を並べた |
| 目標カード | 1セット6枚。難度の構成は全セット `1,1,2,2,3,3` |
| 言い回しの例 | 1枚3件。1件目は目標をそのまま言い切る文、2件目と3件目は理由を述べる文 |
| `keyExpressions` | 1セット3件。「必須だ」「なくてもいける」「どちらが大事か」の型をセットごとの語に合わせて置いた |

テーマは「限られた場面で何を選ぶか」である。
既存の「価値観」パックが抽象的な価値の比較を扱うのに対し、このパックは具体的な物の比較に寄せた。
物の比較は、レベル1〜2でも「なぜ要るか」を身近な理由で言いやすい。

| セットid | 質問 | 項目 |
| --- | --- | --- |
| `desert_island` | 無人島に持っていくなら？ | knife, lighter, water, blanket, phone |
| `emergency_bag` | 防災バッグに最優先で入れるものは？ | flashlight, cash, power bank, medicine, food |
| `camping` | キャンプで一番必要なものは？ | tent, map, rain jacket, stove, bug spray |
| `long_flight` | 12時間のフライトで一番欲しいものは？ | pillow, headphones, snacks, book, window seat |
| `new_room` | 新しい部屋で最初に買うべきものは？ | bed, fridge, curtains, desk, washing machine |
| `power_outage` | 停電で一番困るのは？ | fridge, lights, internet, air conditioner, hot water |

### 目標カードの組み方

全セットで同じ型を使った。

* 難度1は `above` を1枚と、`top` または `bottom` の `within: 2` を1枚置く
* 難度2は `top` または `bottom` の `within: 1` を2枚置く
* 難度3は `exact` を2枚置き、順位は2位と3位にする

対立は、少なくとも1組の目標が同じ順位を奪い合うか、互いの前提を崩す形で入れた。
たとえば `desert_island` では `phone_first`（phoneを1位）と `knife_over_phone`（knifeをphoneより上）が両立しない。
`emergency_bag` と `long_flight` では、難度2の2枚が同じ1位を取り合う。

作成時の版では、`camping` と `new_room` にこの組が無かった（クロスレビューで発見。後述）。
現在の版では、全6セットが難度1か2の目標どうしで両立しない組を1組以上持つ。

`exact` を2位と3位に置いたのは、両端の位置は難度2の述語と意味が重なるためである。
中位の指定は前後の項目まで動かす主張が要り、難度3の定義に合う。

### 同時達成の最大（120通りの総当たり）

作業用のスクリプトで、検証12と13の余裕を測った。
「最大枚数を満たす順位の数」が多いほど、卓が協調できる落としどころが多い。

| セットid | 同時達成の最大 | 最大を満たす順位の数 |
| --- | --- | --- |
| `desert_island` | 4枚 | 4通り |
| `emergency_bag` | 5枚 | 2通り |
| `camping` | 4枚 | 4通り |
| `long_flight` | 4枚 | 8通り |
| `new_room` | 5枚 | 1通り |
| `power_outage` | 5枚 | 1通り |

表は現在の版の値である。
`camping` は作成時の版で5枚、1通りだった（目標の差し替えで変わった。クロスレビューの節を参照）。

既存の「価値観」パックは最大4〜5枚であり、同じ範囲に収まっている。

## 機械検証の結果

`pnpm validate:content` の14項目とスキーマ検証を通過している（2026-09-30実行、0件の警告）。

| # | 内容 | 結果 |
| --- | --- | --- |
| schema | スキーマ | PASS |
| 2 | セット数が6以上 | PASS（6件） |
| 3 | セットidの一意性 | PASS |
| 4 | 項目がちょうど5件、`id` が一意 | PASS |
| 5 | 目標がちょうど6件、`id` が一意 | PASS |
| 6 | 難度の構成が `1,1,2,2,3,3` | PASS |
| 7 | 述語の参照先が項目に存在する | PASS |
| 8 | `within` と `rank` が1〜5 | PASS |
| 9 | 述語の型と難度が対応表と一致する | PASS |
| 10 | 同じ述語を持つ目標が2枚ない | PASS |
| 11 | 各目標が達成可能 | PASS |
| 12 | 6枚を同時に達成できる順位がない | PASS |
| 13 | 同時達成の最大が3枚以上 | PASS（4〜5枚） |
| 14 | `ja` が空でなく、`hintEn` が3件以上 | PASS（全カード3件） |

パック一覧の生成（`generate:packs`）を実行した状態で `pnpm --filter @beb/server-ranking test` が通ることも確認した（79件PASS）。
生成物は統合時に作り直すため、このブランチにはコミットしていない。

## クロスレビュー

### 1巡目（2026-09-30、AIレビュアー1体）

作成者とは別のセッションで起動したAI（モデル: Claude Opus 5.5）が、作成時の記録を読んだうえでレビューした。
人とネイティブ話者は加わっていない。

レビュアーは1体であり、観点を分けた複数のレビュアーが互いの結論を見ずに評価する形ではない。
観点は次の4つである。

| 観点 | 見た内容 |
| --- | --- |
| 英文 | `question`、`items`、`hintEn`、`keyExpressions` が自然か。`hintEn` の1件目が最も平易か。レベル1〜2が読めるか |
| 訳 | `ja` が英語と同じ意味か |
| ゲーム | 目標が議論で狙えるか、対立があるか、項目の粒度、既存パックや他ゲームとの重複 |
| 場の安全性 | 災害を前提にするセットを同室で遊んだときの重さ |

#### 指摘と判断

| # | 箇所 | 指摘 | 判断 |
| --- | --- | --- | --- |
| 1 | `camping`、`new_room` | 両立しない目標の組が1組も無く、5人卓で全員の目標が1つの順位で同時に通る場合がある（表の下で説明する） | 直した。難度1の1枚を、難度2の1枚と両立しない目標に差し替えた |
| 2 | `power_outage` の `keyExpressions` | `X is a big problem.` はXそのものが問題だという意味になり、「Xが無くて困る」の意味にならない。`X is not as bad as Y.` も同じ | 直した。`Losing X is a big problem.` と `Losing X is not as bad as losing Y.` にした |
| 3 | `desert_island` の `water_exact2` | 2件目 `rain can give us more` は意味が取りにくい。3件目 `right after the first one` は何の1番目かが曖昧 | 直した |
| 4 | `long_flight` の `book_exact2` | 3件目 `not better than the first one` が同じく曖昧 | 直した。`it's not number one` にそろえた |
| 5 | `camping` の `bug_spray_over_stove` | 3件目 `a hundred bites` は何に刺されたかが初級者に伝わりにくい | 直した。`bug bites` にした |
| 6 | `emergency_bag` の `power_bank_first` | 3件目 `we can find our family` は家族と離ればなれになった状況を想起させ、題材の中で最も重い | 直した。`call our family` にした |
| 7 | `camping` の `rain_jacket` | `ja` の「雨具」は傘も含み、`en` より広い。自己点検で直した `pillow` と同じ種類のずれ | 直した。「レインジャケット」にした |
| 8 | `emergency_bag`、`power_outage` | 災害を前提にする | 残した。理由は次項 |
| 9 | 難度3の位置 | 全セットで `exact` が2位と3位に固定されている。同じパックを繰り返し遊ぶと、難度3の目標の形が読まれる可能性がある | 直さなかった。作成時の理由（両端は難度2と重なる）は妥当であり、読まれる程度は実プレイでしか分からない。未解決の論点に残す |
| 10 | `long_flight` の `window seat` | 他の4件は持ち込む物だが、これだけ座席の選択である | 直さなかった。「一番欲しいもの」の答えとしては成立し、作成時の意図（反論しやすい項目）もある。未解決の論点に残す |
| 11 | `camping` の `stove` | 日本語の「ストーブ」は暖房器具を指すため、`en` だけを見た参加者が取り違える可能性がある | 直さなかった。`ja` の「調理用コンロ」が注記として画面に出る。`camp stove` にすると他の項目より語数が増える |
| 12 | 項目の重複 | `fridge` が `new_room` と `power_outage` の両方にある | 直さなかった。問いが違い、同じゲームで両方が引かれても論点は重ならない |

指摘1の詳細を述べる。
作成時の版の `camping` と `new_room` は、5枚を同時に満たす順位が1通りあり、そのとき落ちるのは難度3の1枚だった（`camping` は `stove_exact2`、`new_room` は `desk_exact2`）。
6枚同時は検証12で防がれている。

5人卓では難度3が1枚落ちて配られる（`server/games/ranking/src/module.ts` の割り当て）。
落ちたのがその1枚なら、5人全員の目標が1つの順位で同時に通り、議論に対立が生まれない。
作成時の記録の「対立を少なくとも1組入れた」とも食い違っていた。

難度1か2の2枚が両立しなければ、5人卓でどの難度3が落ちても5枚同時は成立しない。
差し替えはこの条件を満たすように選んだ（確定した変更の表）。

指摘1は機械で判定できる形である。
「5人卓で配られる5枚を、1つの順位で同時に満たせない」は、難度3を1枚ずつ除いた5枚について検証12と同じ総当たりをすれば判定できる。
検証スクリプトの変更はこのレビューの範囲外のため、検査への追加は提案に留める。

既存の「価値観」パックの6セットは、全セットが難度1か2の目標どうしで両立しない組を持っており、この欠陥は無い（レビュアーが総当たりで確認した）。

#### 災害を前提にするセットを残した理由

`emergency_bag` は防災バッグの中身、`power_outage` は停電中の家電の優先度を問う。
どちらも備えと生活の工夫の話であり、項目に被害や人の安否を含まない。

防災バッグの準備は学校や職場の訓練で扱う題材であり、同室で話すこと自体の重さは、地震や台風の被害を語る題材より小さい。
重さの出どころは項目ではなく例文の側にあったため、指摘6の1文を直した。

一方で、被災経験のある参加者にとって重く感じられる可能性は消えていない。
ロビーで選べるのはパック単位であり、ホストがこの2セットだけを外す手段は無い。
この点は未解決の論点に残す。

#### 確定した内容

指摘1から7を直し、`pnpm validate:content` の14項目を再度通過した（0件の警告）。
差し替えた2枚を含め、全セットの同時達成の最大と、両立しない目標の組をレビュアーの作業用スクリプトで確かめた。

パックの形が変わったため `pnpm --filter @beb/server-ranking run generate:packs` を実行した。
生成物に差分は出なかった（生成物はパックの一覧だけを持ち、目標の中身を含まない）。
`pnpm --filter @beb/server-ranking test` は79件PASSした。

日本語の文字は「レインジャケット」の「ジ」がこのパックで新しく増えた。
リポジトリの他のコンテンツとクライアントにはすでにある文字である。

### 作成時の自己点検

作成したAI（モデル: Claude Opus 5.5）が収録時に行った点検の記録である。
1巡目のレビューより前の版を対象にしている。

#### 自己点検で見たこと

[基本設計/10](../基本設計/10_ENGLISHRANKINGゲームモジュール.md) が「機械で検査しないもの」とする4点を、作成時に見た。

| 観点 | 見た内容 | 判断 |
| --- | --- | --- |
| 項目が同じ土俵で比べられるか | 各セットの5項目が、同じ場面で同じ予算や容量を取り合う物になっているか | 6セットとも成立と判断した |
| 日本語文が述語を言い表しているか | `ja` を述語から機械的に組み立て、既存パックと同じ定型（「XをYより上にする」「Xを2位以内に入れる」等）にそろえた | 述語との食い違いはない |
| `hintEn` の英文が自然か | 中学英語の範囲の語彙と構文に限り、1文を12語以内に収めた | 不自然な文は見当たらないと判断した。ただしネイティブ話者の確認は経ていない |
| 議論が英語で盛り上がるか | 各セットに、身近な経験から反論しやすい項目を1つ以上入れた（`desert_island` の phone、`long_flight` の window seat、`power_outage` の air conditioner） | 見込みであり、実測はしていない |

#### hintEn の並び順

`hintEn` は先頭から切って配られる（`server/games/ranking/src/module.ts` の `slice(0, hintCountFor(level))`）。
レベル3以上は1件目だけを受け取る。

そのため1件目は、目標をそのまま言い切る最も平易な文にした（例: `The phone must be number one.`）。
2件目と3件目は理由を述べる文であり、レベル1〜2が主張を続けるための材料として置いた。

この並びは既存の「価値観」パックと同じである。

#### 自己点検で直した点

| 対象 | 変更 | 理由 |
| --- | --- | --- |
| `long_flight` の `pillow` | `ja` を「首まくら」から「枕」へ | `en` は `pillow` であり、`ja` だけが種類を限定していた |

## 確定した変更

1巡目のレビュー（2026-09-30）で次のとおり変えた。

| セット | 対象 | 変更前 | 変更後 |
| --- | --- | --- | --- |
| `camping` | 難度1の目標 | `rain_jacket_top2`（rain jacketを2位以内） | `map_top2`（mapを2位以内）。`map_last` と両立しない |
| `camping` | `map_top2` の `hintEn` | （新規） | `The map should be in the top two.` / `Phones often have no signal in the mountains.` / `Getting lost is more dangerous than getting wet.` |
| `new_room` | 難度1の目標 | `curtains_over_desk`（curtainsをdeskより上） | `desk_over_bed`（deskをbedより上）。`bed_first` と両立しない |
| `new_room` | `desk_over_bed` の `hintEn` | （新規） | `A desk is more important than a bed.` / `You can sleep on a futon for now.` / `If you work at home, you need a desk from day one.` |
| `camping` | `rain_jacket` の `ja` | 雨具 | レインジャケット |
| `camping` | `bug_spray_over_stove` の3件目 | `Nobody enjoys camping with a hundred bites.` | `Nobody enjoys camping with a hundred bug bites.` |
| `desert_island` | `water_exact2` の2件目 | `We need water, but rain can give us more.` | `Water is important, but we can collect rain.` |
| `desert_island` | `water_exact2` の3件目 | `Let's put water right after the first one.` | `Let's put water right after number one.` |
| `emergency_bag` | `power_bank_first` の3件目 | `With a charged phone, we can find our family.` | `With a charged phone, we can call our family.` |
| `long_flight` | `book_exact2` の3件目 | `It's great, but not better than the first one.` | `It's great, but it's not number one.` |
| `power_outage` | `keyExpressions` の1件目 | `X is a big problem.`（Xは大問題だ） | `Losing X is a big problem.`（Xがないと大問題だ） |
| `power_outage` | `keyExpressions` の3件目 | `X is not as bad as Y.` | `Losing X is not as bad as losing Y.`（`ja` は変えていない） |

差し替えで、rain jacket と curtains は難度1の目標を失った。
curtains は `curtains_exact3` が残る。
rain jacket を参照する目標は無くなったが、項目としては残り、議論で順位を付ける対象であることは変わらない。

## 未解決の論点

| 論点 | 内容 |
| --- | --- |
| 防災の話題の重さ | `emergency_bag` と `power_outage` は災害を前提にする。被災経験のある参加者には重い可能性がある。1巡目のレビューで残すと判断した（クロスレビューの節）。この2セットだけを外す手段は無い |
| 他ゲームとの重複 | `desert_island` の場面は WHO WROTE THIS? の `q_desert_island` と同じである。同じ日に両方を遊ぶと新鮮さが落ちる可能性がある |
| 同時達成の余裕の偏り | `new_room` と `power_outage` は最大5枚を満たす順位が1通りしかない。卓がその1通りに気付くと議論が早く収束する可能性がある。一方で既存パックにも同じ性質のセットがあり、実プレイで得点分布を見てから判断する |
| 5人卓の同時達成を検査していない | 検証12は6枚について見るが、5人卓で配られる5枚は見ない。このパックは1巡目で手当てしたが、今後のパックで同じ欠陥が入っても機械では落ちない。検証の追加を提案する（クロスレビューの指摘1） |
| 難度3の位置の固定 | 全セットで `exact` が2位と3位である。繰り返し遊ぶと難度3の目標の形が読まれる可能性がある |
| `window seat` の粒度 | `long_flight` の5項目のうち、これだけが持ち込む物ではなく座席の選択である。比べにくいと感じる卓があるかは実プレイで見る |
| 議論時間との釣り合い | 既定の120秒で6人が理由まで言えるかは未実測である（基本設計/10の未解決の論点と同じ） |

## レビューの限界

* 作成時の自己点検と、作成者とは別のAIレビュアー1体による1巡のレビューだけである。レビュアーは作成者と同じモデルであり、同じ種類の見落としを共有している可能性がある
* ネイティブ話者による英文の確認を経ていない。`hintEn` と `keyExpressions` の自然さはAI2体の判断である
* 1巡目で差し替えた2枚（`map_top2`、`desk_over_bed`）の英文は、差し替えたレビュアー自身しか見ていない
* 実プレイのデータは存在しない。議論が盛り上がるか、難度3のカードが通るかは見込みであり、計測値ではない
* 参加者の生活背景を確かめていない。`new_room` や `long_flight` は一人暮らしや長距離移動の経験を前提にしており、経験のない参加者が理由を思い付けるかは未検証である
