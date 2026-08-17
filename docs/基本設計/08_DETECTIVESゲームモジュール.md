# 基本設計: DETECTIVESゲームモジュール

## 結論

DETECTIVESは4ステージ（`briefing` / `investigation` / `voting` / `reveal`）を持つゲームモジュールであり、`GameModule` インターフェースの実装として完結する。

捜査ステージ中にサーバを流れるメッセージはない。会話は対面の生声で行い、サーバは秘密情報の配布と締切の管理だけを担う。

ステージ遷移条件・勝敗条件・配役アルゴリズムは [設計.md](../設計.md) を正とする。
本文書は、そこに書かれていない実装単位の規則（公開状態の構造、`action` の受理規則、秘密情報と結果の構成、表示文言の定数）を定める。

事件データの形式は [04](./04_事件データと検証.md)、共通コアとの境界は [05](./05_ゲームモジュール.md) を正とする。

## 公開状態（gameState）

```typescript
interface DetectivesPublic {
  caseId: string;
  briefing: { ja: string; en: string };   // 全員に開示してよい
  cast: CastEntry[];                       // 誰がどのキャラクターか
  readyPlayerIds: string[];                // briefingステージの収集状況
  votedPlayerIds: string[];                // votingステージの収集状況(投票先は含めない)
  investigationSeconds: number;            // 確定した捜査時間
}

interface CastEntry {
  playerId: string;
  characterId: string;
  characterName: string;
}
```

`cast` を公開するのは、投票画面で容疑者を指すために全員が対応を知る必要があるためである。
`characterId` 自体は犯人性を示さない。犯人はバリアントの抽選で決まり、その結果は `secrets` 側にしか存在しない。

`votedPlayerIds` に投票先を含めない。
誰が投票を終えたかは進行の表示に必要だが、投票先は `reveal` まで秘密である（[ADR-0003](../adr/0003-サーバ権威と秘密情報の個別送信.md)）。

`briefing.en` を公開状態に置くのは、ロビーのカタログには載せず、ゲーム開始後に全員へ配るためである（[01](./01_サーバ.md)）。

`investigationSeconds` を公開状態に置くのは、`briefing` から `investigation` への遷移で締切秒数が要るのに対し、`handleAction` と `onDeadline` には `Room.settings` が渡らないためである。
ホストがロビーで選んだ値であり、伏せる理由もない。

## 秘密情報（secret.payload）

型は `DetectivesSecret`（[設計.md](../設計.md)）とする。
`cards` の要素の型 `TestimonyCard` は `shared/games/detectives/src/game.ts` を構造の正本とし、`factId` / `textEn` / `hintJa` / `disclosure` / `isLie` を持つ。

* `start` 時に全員へ1通ずつ送る
* 再接続時に同じ内容を再送する（共通コアが `secrets` から引く）
* 捜査中の追加送信はない。証言の開示はプレイヤーの発話で行われ、サーバを経由しない

犯人には嘘カードが差し替え済みの状態で渡り、そのカードに `isLie: true` が付く。
犯人が自分の嘘を知らないと、意図的に嘘をつくというゲームが成立しない。

犯人以外の `cards` に `isLie` が真になる要素は存在しない。

### 表示文言の定数

`constraints` と `questionTemplates` は事件データではなくモジュールの定数とする。
事件ごとに変わらないためである。

| レベル | constraints |
| --- | --- |
| 1 | 証言は英語で読み上げる |
| 2 | 証言は英語で読み上げる |
| 3 | 証言は英語で読み上げる / 日本語での補足は禁止 |
| 4 | 証言は英語で読み上げる / 日本語での補足は禁止 / 聞かれた内容にしか答えられないカードがある |
| 5 | 証言は英語で読み上げる / 日本語での補足は禁止 / 断定表現を使わない / 聞かれた内容にしか答えられない |

「証言は英語で読み上げる」を全レベルに課すのは、レベル1〜2を例外にすると日本語ヒントだけで済ませられるためである（[02](./02_クライアント.md)の不変条件）。

`questionTemplates` はレベル1〜2にのみ付与する。内容は `Where were you?` / `What did you see?` / `Who were you with?` / `Are you sure?` の4つとする（[構想v2](../構想v2.md)）。

### 捜査時間の許容範囲

`settings.investigationSeconds` は300秒以上1200秒以下の整数とし、既定値を600秒とする。
範囲外・非整数・型違いは `validateSettings` が拒否する（[ADR-0012](../adr/0012-ゲーム固有設定の検証をゲームモジュールに委ねる.md)）。

下限を300秒に置くのは、6人が英語で質問し合うには5分未満では足りないためである。
上限を1200秒に置くのは、これを超えると会話が尽きて待ち時間になるためである。

`settings` を省略した場合と `configure` が一度も来なかった場合は既定値を使う。

### disclosure の扱い

事実の `disclosure` が `on_question_only` の場合も、サーバは何も制御しない。
該当カードに「聞かれたときだけ答える」印を表示するだけであり、進行にも判定にも影響しない。

制約の遵守は場の指摘に委ねる方針であり、機械的な違反検知は行わない（[構想v2](../構想v2.md)の「やらないこと」）。

## コンテンツの選択とおまかせ

`listContents()` は先頭に「おまかせ（ランダム）」の擬似コンテンツ（id: `random`）を置き、続けて収録事件を並べる。

`start` の `contentId` がこの擬似idだった場合、共通コアが注入したシードで事件を1つ抽選する。
抽選をサーバで行うのは、開始するまで誰も事件を知らない状態を作るためと、同じシードから同じ回を再現できるようにするためである。

ロビーはゲームを選んだ時点でおまかせを既定として `configure` する。事件を指定したい場合はホストが選び直す。

## start の処理順

1. `settings.investigationSeconds` を確定する（既定600秒）
2. `contentId` がおまかせなら事件を抽選する。指定されていればその事件を使う
3. 参加人数に応じて事件を5人版または6人版へ展開する（5人版の導出手順は [06](./06_推論エンジンと検証アルゴリズム.md)）
4. 配役する（アルゴリズムは [設計.md](../設計.md)。同レベル帯のシャッフルに `seed` を使う）
5. 犯人バリアントを抽選する（対象は実プレイヤーのレベルが3以上のキャラクター。該当なしなら最高レベルのプレイヤー。[ADR-0007](../adr/0007-犯人バリアントは実配役プレイヤーのレベルで抽選する.md)）
6. 各プレイヤーの `DetectivesSecret` を組み立てる。犯人の該当カードを嘘へ差し替える
7. `stage: 'briefing'`、`deadlineSeconds: 120` を返す

手順3を手順4より先に行うのは、5人版で統合されたキャラクターに配役してはならないためである。

`seed` は共通コアから注入される（[05](./05_ゲームモジュール.md)）。
同じ `seed` と同じ参加者リストからは、必ず同じ配役と同じ犯人が得られる。

## action の受理規則

| action | 受理stage | 受理条件 | 違反時のコード |
| --- | --- | --- | --- |
| `ready` | briefing | 送信者が参加者 | `invalid_stage` |
| `endInvestigation` | investigation | 送信者がホスト | `invalid_stage` / `not_host` |
| `vote` | voting | 送信者が参加者、`targetPlayerId` が自分以外の参加者、未投票 | `invalid_stage` / `invalid_target` / `already_voted` |

これらのコードは共通コアのエラーコード表に含めず、ゲームモジュールが `GameTransition.reject` で返す（[01](./01_サーバ.md)）。

### ready

すでに `readyPlayerIds` に含まれる送信者からの `ready` は、状態を変えずに受理する。拒否しない。

`vote` と扱いを変えるのは、`ready` が結果に影響しないためである。
二重送信を拒否しても得られるものがなく、通信の再送で画面が止まる経路を作る方が害が大きい。

`readyPlayerIds` に接続中の全員が揃ったら `investigation` へ遷移し、`deadlineSeconds` に捜査時間を設定する。

### endInvestigation

捜査を切り上げて `voting` へ進む。締切秒数は投票の既定値（90秒）とする。

捜査の締切は上限であって下限ではない。会話が尽きた組を残り時間だけ待たせる理由がない。

操作をホストに限るのは、1人の判断で全員の会話を打ち切れないようにするためである。
ホストが切断していれば権限は自動移譲されているため（[01](./01_サーバ.md)）、この操作が誰も送れない状態にはならない。

### vote

自分への投票を禁止する。犯人が自分に投票して票を操作する余地をなくすためであり、人狼型ゲームの慣習にも合う。

投票の変更を許さない。1回目を確定とする（[03](./03_プロトコル.md)）。

`votedPlayerIds` に接続中の全員が揃ったら `reveal` へ遷移し、`result` を返す。

## onDeadline

| stage | 遷移先 | 未入力者の扱い |
| --- | --- | --- |
| briefing | investigation | 未readyを既読扱いにする |
| investigation | voting | — |
| voting | reveal | 未投票を棄権として扱う。棄権は集計の分母にも分子にも入れない |
| reveal | 遷移しない | — |

`reveal` には締切を置かない。`lifecycle: finished` で `nextGame` を待つ（[01](./01_サーバ.md)）。

全ステージに締切があるため、切断者が出ても進行は止まらない。

## 結果（result.payload）

```typescript
interface DetectivesResult {
  culprit: { playerId: string; characterId: string };
  lieCard: { textEn: string; hintJa: string };
  contradictions: ContradictionExplanation[];
  votes: { voterPlayerId: string; targetPlayerId: string }[];
  outcome: 'citizens' | 'culprit';
  timelineEn: string[];
  keyExpressions: { en: string; ja: string }[];
}

interface ContradictionExplanation {
  meaningJa: string;
  supportingCards: { characterName: string; textEn: string }[];
}
```

勝敗は最多票が犯人に一致すれば市民勝利、同数タイは犯人勝利とする（[設計.md](../設計.md)）。

### 表示する英文のレベル

`lieCard.textEn` は、犯人役を担当したプレイヤーのレベルの英文を使う。
`supportingCards[].textEn` は、その事実の所有キャラクターに配役されたプレイヤーのレベルの英文を使う。

固定レベルの英文を出さないのは、振り返りで見るべきものが「場で実際に読み上げられた文」だからである。
別レベルの英文を出すと、聞いた覚えのない文が矛盾の根拠として提示される。

`votes` は投票内訳をそのまま開示する。誰が誰に入れたかは同室の全員が結果発表で共有する情報であり、伏せる理由がない。

## テスト観点

`GameModule` は純粋関数のため、Durable Objectなしで全項目をテストする。

* 決定性: 同じ `seed` と同じ参加者から、同じ配役・同じ犯人・同じ秘密情報が得られること
* 配役: 5人時に `merge5p` で統合されたキャラクターへ配役されないこと
* 犯人抽選: 全員がレベル1〜2の組で、最高レベルのプレイヤーが犯人になること
* 秘密の非混入: `DetectivesPublic` に `isCulprit` / 証言テキスト / 投票先が現れないこと
* `vote`: 自分への投票が `invalid_target`、2回目が `already_voted` で拒否され、状態が変わらないこと
* `ready`: 二重送信が拒否されず、状態も変わらないこと
* 遷移: 接続中の全員が揃った時点で遷移し、切断者を待たないこと
* 棄権: 締切到達時、未投票者が分母にも分子にも入らないこと
* タイ: 最多票が並んだ場合に `outcome: 'culprit'` になること
* 結果の英文レベル: `lieCard.textEn` が犯人役プレイヤーのレベルの英文と一致すること
