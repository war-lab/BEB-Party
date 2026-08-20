# 0021: E2Eのwrangler devは監督プロセスで再起動する

* ステータス: accepted
* 日付: 2026-08-20

## 決定

E2Eのサーバを `pnpm dev` ではなく `pnpm e2e:server` で起動し、`wrangler dev` を監督プロセス（`scripts/e2e-server.mjs`）の下で動かす。
`wrangler dev` が終了した場合、監督プロセスが理由をログへ出して再起動する。

構成は次の通りとする。

* `pnpm e2e:server` = `client/app` のビルド + `node scripts/e2e-server.mjs`
* 監督プロセスは `server/core` の `dev:e2e`（`wrangler dev --log-level warn`）を起動し、終了を検知して1秒後に再起動する
* 5秒未満での終了が3回続いた場合は、設定不備とみなして再起動を打ち切る（待ち受け開始まで10秒前後かかるため、この長さで起動失敗と稼働中の終了を見分ける）
* Playwrightの `webServer` は `stdout` と `stderr` の両方をCIログへ流す

Vite devサーバはE2Eでは起動しない。

## 理由

`wrangler dev`（4.122.0、miniflare 5.20260811.0-alpha）は、ProxyWorkerで発生した `Network connection lost.` を致命的なエラーとして扱い、内容が空の `✘ [ERROR]` を出してプロセスごと終了する。
同じシグネチャの上流バグが未修正で報告されている（[workers-sdk#15203](https://github.com/cloudflare/workers-sdk/issues/15203)、[#14926](https://github.com/cloudflare/workers-sdk/issues/14926)）。
#15203は `assets` を設定したWorkerで再現するとしており、本リポジトリの `server/core/wrangler.jsonc` も `assets` を設定している。

E2Eは1テストで最大6つのブラウザコンテキストを開き、切断と再接続を短時間に繰り返す。
この負荷でこの終了を踏むことが、CIとローカルの両方で実測された。

Playwrightの `webServer` は起動時の待ち受けだけを確認し、テスト中にサーバが終了しても検知しない。
そのため一度終了すると、以降の全テストが retry を含めて `ERR_CONNECTION_REFUSED` で落ちる。
CIの実行32315889895では、15テストのうち後半7テストがこの形で失敗した。
同一コミットの再実行は成功しており、発生はサーバの終了タイミング次第である。

再起動を選んだ理由は、他の案がいずれもE2Eの信頼性を回復しないためである。

* **wranglerの更新**: #15203は4.123.0に対する報告であり、最新版でも未修正である
* **wranglerの旧版固定**: 終了しない版まで戻すと、デプロイ時のwranglerとローカルのwranglerが乖離する。乖離した状態でE2Eを回す意味は薄い
* **`assets` の削除**: `wrangler dev` が静的アセットとWorkerを同一オリジンで配信する構成そのものがE2Eの検証対象であり、外せない
* **CIでのE2Eの除外・リトライ回数の増加**: 前者は検証を失う。後者はサーバが復帰しない限り効かない

再起動で救えるのは、サーバが落ちた瞬間に走っていたテスト以外である。
落ちたテスト自体はPlaywrightのretryで再実行される。

Vite devサーバをE2Eで起動しないのは、Playwrightが見るのは `wrangler dev` の8787のみで、5173のVite devサーバをE2Eが使わないためである。
加えて `pnpm --parallel` は並走スクリプトの片方が非ゼロ終了すると残りも終了させる（`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`、pnpm 11.21.0で実測）。
E2Eが使わないプロセスの異常終了で `wrangler dev` ごと消える経路を残す理由がない。

## 影響

* 再起動は開発時のE2Eに限った措置であり、`wrangler deploy` されるWorkerの挙動には関係しない
* サーバが再起動すると、その時点の部屋の状態は失われる。E2Eは1テスト=1部屋で、テスト間で状態を引き継がないため、この前提は崩れない
* 監督プロセスが出す `[e2e-server] wrangler devが終了した` の行は、E2Eの失敗がアプリの不具合かサーバの終了かを切り分ける手がかりとして残す。この行が出ていないのにテストが落ちた場合は、アプリ側の不具合として扱う
* CIはE2Eの失敗時にPlaywrightのレポートとトレースを `actions/upload-artifact` で保存する（保持7日）
* 上流バグが修正され、`wrangler dev` が終了しなくなった場合は、監督プロセスを外して `wrangler dev` の直接起動に戻す。判断材料は監督プロセスのログ（終了が観測されなくなったか）とする
* `pnpm dev`（開発時の通常起動）は変更しない。Vite devサーバのHMRは開発の生産性に必要である
