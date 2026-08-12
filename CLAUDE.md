# BEB Party

同室の5〜6人が遊ぶ英語推理パーティゲーム（人狼型）のWebアプリ。
スマホブラウザSPA + Cloudflare Workers + Durable Objects。運用費¥0が絶対条件。

## 最初に読むもの

ドキュメントの正本マップは `docs/README.md`。
モジュールを触る前に、対応する `docs/基本設計/` の文書を必ず読む。
`docs/archive/` は置換済みの旧文書であり、仕様の根拠にしない。

## 不変条件（違反するコード・提案は書かない）

1. **ゼロコスト**: 有料サービス・ランタイムのAI API・音声処理を導入しない。アプリは英語を理解しない（[ADR-0001](docs/adr/0001-ランタイムAI不使用.md)）
2. **秘密情報の分離**: 証言・犯人フラグを `state` ブロードキャストに含めない。該当プレイヤーのソケットへの個別送信のみ（[ADR-0003](docs/adr/0003-サーバ権威と秘密情報の個別送信.md)）
3. **公開値を認証に使わない**: 再接続は `reconnectToken`（本人にのみ送る秘密値）で行う。`state` に載る `playerId` を認証情報として受理しない（[ADR-0006](docs/adr/0006-公開IDと再接続シークレットの分離.md)）
4. **サーバ権威**: ゲームルールの判定・タイマー・集計はすべてDurable Object内で行う。クライアントは表示と入力のみ
5. **Hibernation必須 / SQLiteバックエンド**: DOのWebSocketはHibernation APIで実装する（`accept()` 直呼びは禁止）。マイグレーションは `new_sqlite_classes` で宣言する（無料プランはSQLiteバックエンドのみ利用可）（[ADR-0002](docs/adr/0002-CloudflareDurableObjects採用.md)）
6. **事件データの検証**: `cases/` の追加・変更は `pnpm validate:cases` がPASSしない限りマージしない。矛盾定義には嘘factを必ず含める（[ADR-0008](docs/adr/0008-矛盾定義は嘘factを明示的に含める.md)）

## 規約

* コード内コメントは日本語
* ブランチは `task/<内容>`（`feature/` は使わない）
* コミットメッセージは日本語 + プレフィックス（`機能:` `修正:` `文書:` `整備:` `テスト:`）
* PRはドラフトで作成。1PR = 1モジュール（`shared/` を変えるPRは他モジュールと混ぜない）
* 詳細は `docs/開発ガイド.md`

## コマンド

M0（骨組み）完了時に確定させる。確定後、この節を実コマンドで更新すること。

| コマンド | 用途 |
| --- | --- |
| `pnpm dev` | client(Vite) + server(wrangler dev) を同時起動 |
| `pnpm test` | 全ワークスペースのユニットテスト |
| `pnpm validate:cases` | 事件データの整合性検証 |
| `pnpm check` | lint + 型チェック |

## Definition of Done

コード変更のPRは以下を満たす。

* `pnpm check` / `pnpm test` / `pnpm validate:cases` がPASS
* 変更したモジュールの正本ドキュメント（`docs/README.md` 参照）を同PRで更新済み
* 設計判断を変えた場合はADRを追加済み
