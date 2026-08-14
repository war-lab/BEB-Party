// ゲームIDからGameModuleを引くテーブル。共通コアでゲームモジュールをimportしてよいのはこのファイルだけ（不変条件4、ADR-0009）
// M0時点では空テーブル。M2でDETECTIVESを登録する
import type { GameModule } from "@beb/shared-core";

export const registry: Record<string, GameModule<unknown, unknown, unknown>> = {};
