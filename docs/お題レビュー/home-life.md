# お題レビュー: 住まいと近所づきあい（ranking / home-life）

## 結論

お題6セット（項目30件、目標カード36枚、言い回しの例108件、`keyExpressions` 18件）を収録した。
検証14項目とスキーマ検証をすべて通過している。

人手レビューは行っていない。
作成したAIによる自己点検のあと、作成者とは別のAIレビュアー（Claude Opus 5.5）が1巡のレビューを行い、英文7か所、訳2か所、目標カード1枚を直した。
レビュアーは1体であり、DON'T SAY ITのような3観点の独立したクロスレビューではない。

したがって、英文の自然さと場の安全性はAI2体の判断であり、人とネイティブ話者は確認していない。
目標の対立の有無は、レビュアーが120通りの総当たりで全セットを確かめた。

**実プレイは経ていない**。
議論の盛り上がり、目標の通りやすさ、得点分布は未実測であり、未解決の論点に残す。

お題データの正本は `content/ranking/home-life.json`、ルールの正本は [基本設計/10](../基本設計/10_ENGLISHRANKINGゲームモジュール.md) である。

## 経緯

| 日付 | 出来事 |
| --- | --- |
| 2026-09-30 | 6セットを収録し、検証14項目を通過。作成AIによる自己点検のみ（クロスレビュー未実施） |
| 2026-09-30 | 作成者と別のAIレビュアーが1巡レビュー。`home_party` に両立しない目標の組が無く、5人卓で全員の目標が同時に通りうる欠陥を見つけ、目標を1枚差し替えた。`keyExpressions` の意味のずれと英文も直し、検証14項目を再度通過 |

## パックの骨格

| 項目 | 内容 |
| --- | --- |
| セット | 6件（検証2の下限6件ちょうど。1ゲームで3セット使う） |
| 項目 | 1セット5件。住む場所の条件、同居や近所の相手に求める性質、家での過ごし方の3系統 |
| 目標カード | 1セット6枚。難度の構成は全セット `1,1,2,2,3,3` |
| 言い回しの例 | 1枚3件。1件目は目標をそのまま言い切る文、2件目と3件目は理由を述べる文 |
| `keyExpressions` | 1セット3件。「譲れない」「我慢できる」「なぜそれが大事か」の型をセットごとの語に合わせて置いた |

テーマは「どこに、誰と、どう住むか」である。
依頼時の候補だった「旅行の計画」は採らなかった。
既存の「価値観」パックに `travel`（旅行で一番大事なのは？）があり、項目も food、safety、price、weather、people と計画の論点に重なるためである。

住まいの話題は誰もが日常で経験しているため、レベルに関係なく経験から理由を出せる。
「どちらを取るか」で意見が割れやすい組（家賃と立地、猫と犬）を意図して入れた。

| セットid | 質問 | 項目 |
| --- | --- | --- |
| `ideal_town` | 住みやすい街の条件は？ | parks, trains, shops, hospitals, schools |
| `ideal_home` | 部屋探しで一番大事なのは？ | rent, size, location, sunlight, kitchen |
| `good_neighbor` | 良いご近所さんの条件は？ | kindness, quietness, cleanliness, privacy, greetings |
| `roommate` | ルームメイトに一番求めるものは？ | tidiness, cooking, sleep schedule, honesty, humor |
| `apartment_pet` | 狭い部屋で飼うならどのペット？ | cat, dog, fish, rabbit, hamster |
| `home_party` | ホームパーティを楽しくするのは？ | food, music, games, guests, decorations |

### 目標カードの組み方

全セットで同じ型を使った。

* 難度1は `above` を1枚と、`top` または `bottom` の `within: 2` を1枚置く
* 難度2は `top` または `bottom` の `within: 1` を2枚置く
* 難度3は `exact` を2枚置き、順位は2位と3位にする

対立は、少なくとも1組の目標が同じ順位を奪い合うか、互いの前提を崩す形で入れた。
たとえば `good_neighbor` では `greetings_top2`（greetingsを2位以内）と `greetings_last`（greetingsを最下位）を、1つの順位で同時に満たせない。
`ideal_town`、`ideal_home`、`apartment_pet` では、難度2の2枚が同じ1位を取り合う。

作成時の版では、`home_party` にこの組が無かった（クロスレビューで発見。後述）。
現在の版では、全6セットが難度1か2の目標どうしで両立しない組を1組以上持つ。

`exact` を2位と3位に置いたのは、両端の位置は難度2の述語と意味が重なるためである。
中位の指定は前後の項目まで動かす主張が要り、難度3の定義に合う。

### 同時達成の最大（120通りの総当たり）

作業用のスクリプトで、検証12と13の余裕を測った。
「最大枚数を満たす順位の数」が多いほど、卓が協調できる落としどころが多い。

| セットid | 同時達成の最大 | 最大を満たす順位の数 |
| --- | --- | --- |
| `ideal_town` | 4枚 | 8通り |
| `ideal_home` | 4枚 | 4通り |
| `good_neighbor` | 4枚 | 4通り |
| `roommate` | 4枚 | 3通り |
| `apartment_pet` | 5枚 | 2通り |
| `home_party` | 4枚 | 4通り |

表は現在の版の値である。
`home_party` は作成時の版で5枚、1通りだった（目標の差し替えで変わった。クロスレビューの節を参照）。

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
観点は「持ち物と道具」パック（[gear.md](./gear.md)）の1巡目と同じ4つである。

| 観点 | 見た内容 |
| --- | --- |
| 英文 | `question`、`items`、`hintEn`、`keyExpressions` が自然か。`hintEn` の1件目が最も平易か。レベル1〜2が読めるか |
| 訳 | `ja` が英語と同じ意味か |
| ゲーム | 目標が議論で狙えるか、対立があるか、項目の粒度、既存パックや他ゲームとの重複 |
| 場の安全性 | 私生活に踏み込む題材を同室で遊んだときの重さ |

#### 指摘と判断

| # | 箇所 | 指摘 | 判断 |
| --- | --- | --- | --- |
| 1 | `home_party` | 両立しない目標の組が1組も無く、5人卓で全員の目標が1つの順位で同時に通る場合がある（表の下で説明する） | 直した。`food_top2` を、`decorations_last` と両立しない `decorations_top2` に差し替えた |
| 2 | `good_neighbor` の `keyExpressions` | 項目はすべて良い性質であり、`X bothers me the most.` に入れると「静かさが一番迷惑だ」の意味になる | 直した。`I care about X the most.` にした。`ja` の「Xが一番気になる」はこの英文と合う |
| 3 | `roommate` の `keyExpressions` | `X causes a lot of fights.` も同じく、`honesty` を入れると「正直さがケンカの原因」になる | 直した。`Without X, there will be fights.`（Xがないとケンカになる）にした |
| 4 | `ideal_home` の `keyExpressions` | `X is a deal breaker` は本来「それがあると契約をやめる欠点」を指し、`ja` の「譲れない条件」と向きが逆になりうる。初級者には慣用句として難しい | 直した。`X is a must for me.` にした |
| 5 | `ideal_home` の `keyExpressions` | `I can live with X.` は `rent` や `location` を入れると意味が通らない | 直した。`I can give up on X.`（Xは譲れる）にし、1件目の「譲れない条件」と対にした |
| 6 | `ideal_home` の `location_first` | 3件目 `takes hours from your life` は大げさで、慣用の形でもない | 直した。`takes hours out of your day` にした |
| 7 | `ideal_home` の `sunlight_exact3` | 2件目の主語 `Sun` が項目の語 `sunlight` とずれる | 直した。`Sunlight is nice` にした |
| 8 | `roommate` の `sleep_schedule_exact2` | 3件目 `it's not the top` は不自然 | 直した。`it's not number one` にした |
| 9 | `good_neighbor` の `privacy`、`greetings` | 隣人の性質としては `respect for privacy`、`saying hello` の方が正確である | 直さなかった。`ja` の注記（干渉しないこと、あいさつ）で意味は伝わり、語を長くすると画面で大きく出す項目に向かない |
| 10 | 難度3の位置 | 全セットで `exact` が2位と3位に固定されている | 直さなかった。未解決の論点に残す（gear.mdと同じ判断） |
| 11 | 他パックとの重複 | `home_party` の music と games は「価値観」の `learn_english`、food は `happy_life` にもある | 直さなかった。問いが違い、同じ語でも比べる理由が重ならない |

指摘1の詳細を述べる。
作成時の版の `home_party` は、5枚を同時に満たす順位が1通り（guests、food、games、music、decorations の順）あり、そのとき落ちるのは難度3の `music_exact2` だった。
6枚同時は検証12で防がれている。

5人卓では難度3が1枚落ちて配られる（`server/games/ranking/src/module.ts` の割り当て）。
落ちたのが `music_exact2` なら、5人全員の目標が1つの順位で同時に通り、議論に対立が生まれない。
作成時の記録の「対立を少なくとも1組入れた」とも食い違っていた。

難度1か2の2枚が両立しなければ、5人卓でどの難度3が落ちても5枚同時は成立しない。
`decorations_top2` と `decorations_last` はこの条件を満たす。
卓では、飾り付けは写真のために要るという主張と、10分で誰も見なくなるという主張がぶつかる。

同じ欠陥は「持ち物と道具」パックの `camping` と `new_room` にもあった（[gear.md](./gear.md)）。
機械で判定できる形であり、検証への追加を提案する。
検証スクリプトの変更はこのレビューの範囲外である。

#### 場の安全性

家賃、同居、ペットは私生活に関わるが、問いはどれも「どれを重く見るか」であり、自分の住まいを明かさずに答えられる。
作成時の記録の「レビューの限界」に挙げた懸念は残るが、差し替えるほどの重さは無いと判断した。

#### 確定した内容

指摘1から8を直し、`pnpm validate:content` の14項目を再度通過した（0件の警告）。
差し替えた1枚を含め、全セットの同時達成の最大と、両立しない目標の組をレビュアーの作業用スクリプトで確かめた。

パックの形が変わったため `pnpm --filter @beb/server-ranking run generate:packs` を実行した。
生成物に差分は出なかった（生成物はパックの一覧だけを持ち、目標の中身を含まない）。
`pnpm --filter @beb/server-ranking test` は79件PASSした。

日本語の文字は新しく増えていない。
「妥協」は候補に挙げたが、「妥」がリポジトリに無いため「譲れる」にした。

### 作成時の自己点検

作成したAI（モデル: Claude Opus 5.5）が収録時に行った点検の記録である。
1巡目のレビューより前の版を対象にしている。

#### 自己点検で見たこと

[基本設計/10](../基本設計/10_ENGLISHRANKINGゲームモジュール.md) が「機械で検査しないもの」とする4点を、作成時に見た。

| 観点 | 見た内容 | 判断 |
| --- | --- | --- |
| 項目が同じ土俵で比べられるか | 各セットの5項目が、同じ問いに対する答えの候補として並ぶか | 6セットとも成立と判断した。`good_neighbor` と `roommate` は性質の比較、それ以外は物や場所の比較である |
| 日本語文が述語を言い表しているか | `ja` を述語から機械的に組み立て、既存パックと同じ定型（「XをYより上にする」「Xを2位以内に入れる」等）にそろえた | 述語との食い違いはない |
| `hintEn` の英文が自然か | 中学英語の範囲の語彙と構文に限り、1文を12語以内に収めた | 不自然な文は見当たらないと判断した。ただしネイティブ話者の確認は経ていない |
| 議論が英語で盛り上がるか | 意見が割れやすい組を各セットに1つ以上入れた（`ideal_home` の rent と location、`apartment_pet` の cat と dog、`good_neighbor` の greetings） | 見込みであり、実測はしていない |

#### hintEn の並び順

`hintEn` は先頭から切って配られる（`server/games/ranking/src/module.ts` の `slice(0, hintCountFor(level))`）。
レベル3以上は1件目だけを受け取る。

そのため1件目は、目標をそのまま言い切る最も平易な文にした（例: `Rent must be number one.`）。
2件目と3件目は理由を述べる文であり、レベル1〜2が主張を続けるための材料として置いた。

この並びは既存の「価値観」パックと同じである。

#### 自己点検で決めた点

| 対象 | 判断 | 理由 |
| --- | --- | --- |
| パックid | `home-life`（ハイフン区切り） | 他ゲームのコンテンツのファイル名（`famous-figures` 等）に合わせた。セットidと項目idは既存の ranking パックに合わせて下線区切りとした |
| `roommate` の生活リズム | 項目の `en` を `schedule` ではなく `sleep schedule` にした | `schedule` だけでは予定表の意味に読め、生活リズムの意味が伝わらない |
| `home_party` の `guests` | `ja` を「呼ぶ顔ぶれ」にした | 「客」とすると人数の多さの話に読め、誰を呼ぶかの比較にならない |

## 確定した変更

1巡目のレビュー（2026-09-30）で次のとおり変えた。

| セット | 対象 | 変更前 | 変更後 |
| --- | --- | --- | --- |
| `home_party` | 難度1の目標 | `food_top2`（foodを2位以内） | `decorations_top2`（decorationsを2位以内）。`decorations_last` と両立しない |
| `home_party` | `decorations_top2` の `hintEn` | （新規） | `Decorations should be in the top two.` / `Decorations make a normal room feel special.` / `Everyone wants nice photos of the party.` |
| `ideal_home` | `location_first` の3件目 | `A long commute takes hours from your life.` | `A long commute takes hours out of your day.` |
| `ideal_home` | `sunlight_exact3` の2件目 | `Sun is nice, but you're at work all day.` | `Sunlight is nice, but you're at work all day.` |
| `ideal_home` | `keyExpressions` の1件目 | `X is a deal breaker for me.` | `X is a must for me.`（`ja` は変えていない） |
| `ideal_home` | `keyExpressions` の2件目 | `I can live with X.`（Xなら我慢できる） | `I can give up on X.`（Xは譲れる） |
| `good_neighbor` | `keyExpressions` の1件目 | `X bothers me the most.` | `I care about X the most.`（`ja` は変えていない） |
| `roommate` | `sleep_schedule_exact2` の3件目 | `It matters a lot, but it's not the top.` | `It matters a lot, but it's not number one.` |
| `roommate` | `keyExpressions` の1件目 | `X causes a lot of fights.`（Xはケンカの原因になりやすい） | `Without X, there will be fights.`（Xがないとケンカになる） |

差し替えで、food は目標を参照されなくなった。
項目としては残り、議論で順位を付ける対象であることは変わらない。

## 未解決の論点

| 論点 | 内容 |
| --- | --- |
| 前提の偏り | `roommate` は同居、`apartment_pet` はペットを飼える住まいを前提にする。経験のない参加者は理由を想像で組むことになり、発言が減る可能性がある |
| 性質の比較の難しさ | `good_neighbor` と `roommate` は抽象名詞（quietness、tidiness 等）を並べる。物の比較より理由を言いにくい可能性があり、レベル1〜2の卓で詰まるかは未検証である |
| 同時達成の余裕の偏り | 1巡目の差し替えで `home_party` は最大4枚、4通りになり、最大5枚が1通りのセットは無くなった。`apartment_pet` は最大5枚が2通りである。議論の収束の速さは実プレイで見る |
| 5人卓の同時達成を検査していない | 検証12は6枚について見るが、5人卓で配られる5枚は見ない。検証の追加を提案する（クロスレビューの指摘1） |
| 難度3の位置の固定 | 全セットで `exact` が2位と3位である。繰り返し遊ぶと難度3の目標の形が読まれる可能性がある |
| 議論時間との釣り合い | 既定の120秒で6人が理由まで言えるかは未実測である（基本設計/10の未解決の論点と同じ） |

## レビューの限界

* 作成時の自己点検と、作成者とは別のAIレビュアー1体による1巡のレビューだけである。レビュアーは作成者と同じモデルであり、同じ種類の見落としを共有している可能性がある
* ネイティブ話者による英文の確認を経ていない。`hintEn` と `keyExpressions` の自然さはAI2体の判断である
* 1巡目で差し替えた `decorations_top2` の英文は、差し替えたレビュアー自身しか見ていない
* 実プレイのデータは存在しない。議論が盛り上がるか、難度3のカードが通るかは見込みであり、計測値ではない
* 住まいの事情に関わる話題（家賃、同居、ペット）が参加者にとって答えにくいものかを確かめていない。卓の関係性によっては私生活に踏み込む話題になる可能性がある
