# ADR（Architecture Decision Record）

## 運用

* 覆すコストが高い決定、不変条件の追加・変更、理由を知らないと直したくなる方針をADRにする（判断基準は [開発ガイド](../開発ガイド.md)）
* ファイル名: `NNNN-タイトル.md`（連番4桁）
* 決定を覆すときは新しいADRを追加し、旧ADRのステータスを `superseded by NNNN` に変える。本文は書き換えない

## テンプレート

```markdown
# NNNN: タイトル

* ステータス: accepted | superseded by NNNN
* 日付: YYYY-MM-DD

## 決定

(1-3文で決定内容)

## 理由

(なぜそうしたか。検討した代替案と捨てた理由)

## 影響

(この決定が課す制約。違反例があれば具体的に)
```

## 一覧

| # | タイトル | ステータス |
| --- | --- | --- |
| [0001](./0001-ランタイムAI不使用.md) | ランタイムAI不使用（ゼロコスト原則） | accepted |
| [0002](./0002-CloudflareDurableObjects採用.md) | Cloudflare Workers + Durable Objects採用、DBなし | accepted |
| [0003](./0003-サーバ権威と秘密情報の個別送信.md) | サーバ権威と秘密情報の個別送信 | accepted |
| [0004](./0004-事件データの静的JSON化とCI検証.md) | 事件データの静的JSON化とCI検証 | accepted |
| [0005](./0005-MVPはENGLISH-DETECTIVES.md) | MVPはENGLISH DETECTIVES | accepted |
| [0006](./0006-公開IDと再接続シークレットの分離.md) | 公開IDと再接続シークレットの分離 | accepted |
| [0007](./0007-犯人バリアントは実配役プレイヤーのレベルで抽選する.md) | 犯人バリアントは実配役プレイヤーのレベルで抽選する | accepted |
| [0008](./0008-矛盾定義は嘘factを明示的に含める.md) | 矛盾定義は嘘factを明示的に含める | accepted |
