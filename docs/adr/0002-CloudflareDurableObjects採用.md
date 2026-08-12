# 0002: Cloudflare Workers + Durable Objects採用、DBなし

* ステータス: accepted
* 日付: 2026-08-10

## 決定

配信・API・リアルタイム同期をCloudflare Workers無料プランで構成する。
部屋の状態はDurable Object（部屋 = 1インスタンス）に置き、外部データベースを持たない。
Durable ObjectのWebSocketはHibernation APIでのみ実装する。

## 理由

部屋単位の直列化された状態機械というゲームの構造が、DOのモデル（インスタンス = 単一実行コンテキスト）と一致する。
部屋は数時間で消える揮発データしか持たないため、DBは複雑さだけを足す。

代替案のFirebase（Spark）はロックインが強く、P2P（WebRTC）はモバイル回線のNAT越えが不安定なため捨てた。

Hibernation必須なのは、通常のWebSocket維持は接続中ずっと実行時間課金の対象となり、無通信の捜査フェーズ10分超で無料枠を浪費するためである。

## 影響

* `ws.accept()` を使う実装、常駐タイマー（`setInterval`）に依存する実装は禁止。時間駆動はDOアラームで行う
* 状態はHibernation復帰で失われる前提で書く（storage書き込みが正、インメモリはキャッシュ）
* 無料枠の規約変更に備え、状態の揮発性を保ち他PaaSへ移設可能な構造を維持する
