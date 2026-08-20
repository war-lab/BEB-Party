# BEB Party

同室の5〜6人が遊ぶ**英語パーティゲーム集**のWebアプリ。
1つの部屋基盤に複数ゲームを載せる。収録済みは英語推理ゲーム「ENGLISH DETECTIVES」（人狼型）と、禁止語を避けて人物を説明する「DON'T SAY IT」の2本。
スマホブラウザSPA + Cloudflare Workers + Durable Objects。運用費¥0が絶対条件。

## 最初に読むもの

ドキュメントの正本マップは `docs/README.md`。
モジュールを触る前に、対応する `docs/基本設計/` の文書を必ず読む。
`docs/archive/` は置換済みの旧文書であり、仕様の根拠にしない。

## 不変条件（違反するコード・提案は書かない）

1. **ゼロコスト**: 有料サービス・ランタイムのAI API・音声処理を導入しない。アプリは英語を理解しない（[ADR-0001](docs/adr/0001-ランタイムAI不使用.md)）
2. **秘密情報の分離**: 証言・犯人フラグを `state` ブロードキャストに含めない。該当プレイヤーのソケットへの個別送信のみ（[ADR-0003](docs/adr/0003-サーバ権威と秘密情報の個別送信.md)）
3. **公開値を認証に使わない**: 再接続は `reconnectToken`（本人にのみ送る秘密値）で行う。`state` に載る `playerId` を認証情報として受理しない（[ADR-0006](docs/adr/0006-公開IDと再接続シークレットの分離.md)）
4. **共通コアはゲームを知らない**: `core/` にゲーム固有の概念（ステージ名・証言・犯人等）を持ち込まない。ゲームIDによる分岐は `server/core/registry.ts` の1箇所のみ（[ADR-0009](docs/adr/0009-部屋基盤とゲームモジュールの分離.md)）
5. **サーバ権威**: ゲームルールの判定・タイマー・集計はすべてDurable Object内で行う。クライアントは表示と入力のみ
6. **Hibernation必須 / SQLiteバックエンド**: DOのWebSocketはHibernation APIで実装する（`accept()` 直呼びは禁止）。マイグレーションは `new_sqlite_classes` で宣言する（無料プランはSQLiteバックエンドのみ利用可）（[ADR-0002](docs/adr/0002-CloudflareDurableObjects採用.md)）
7. **コンテンツの検証**: `content/` の追加・変更は `pnpm validate:content` がPASSしない限りマージしない。DETECTIVESの矛盾定義には嘘factを必ず含める（[ADR-0008](docs/adr/0008-矛盾定義は嘘factを明示的に含める.md)）

## 規約

* コード内コメントは日本語
* ブランチは `dev` から `task/<内容>` を切り、`dev` へPRする（`feature/` は使わない。`main` はリリース専用）
* コミットメッセージは日本語 + プレフィックス（`機能:` `修正:` `文書:` `整備:` `テスト:`）
* PRはドラフトで作成。1PR = 1モジュール（`shared/core/` を変えるPRは他モジュールと混ぜない）
* 詳細は `docs/開発ガイド.md`

## コマンド

定義は [docs/基本設計/07_リポジトリとツールチェーン.md](docs/基本設計/07_リポジトリとツールチェーン.md)。

| コマンド | 用途 |
| --- | --- |
| `pnpm dev` | client(Vite) + server(wrangler dev) を同時起動 |
| `pnpm check` | 全パッケージのESLintと`tsc --noEmit` |
| `pnpm test` | 全パッケージのvitest |
| `pnpm validate:content` | 事件データの整合性検証（`tools`のCLI）。引数にファイルパスを渡すと1件だけ検証する |
| `pnpm e2e` | Playwright（部屋作成から開示までの通し検証）。E2E用サーバは自動起動 |
| `pnpm e2e:server` | E2E用サーバの単独起動（`client/app` のビルド + `server/core` の `wrangler dev`） |

生成物を作るコマンド（生成物はコミットし、CIで再生成との差分を検査する）。

| コマンド | 用途 |
| --- | --- |
| `pnpm --filter @beb/server-detectives run generate:cases` | 事件インデックス（`cases.generated.ts`）の生成 |
| `pnpm --filter @beb/client-app run fonts:generate` | フォントサブセットの生成 |
| `pnpm --filter @beb/client-app run icons:generate` | プレイヤーアイコン（128×128 PNG）の生成 |

## Definition of Done

コード変更のPRは以下を満たす。

* `pnpm check` / `pnpm test` / `pnpm validate:content` がPASS
* 変更したモジュールの正本ドキュメント（`docs/README.md` 参照）を同PRで更新済み
* 設計判断を変えた場合はADRを追加済み
