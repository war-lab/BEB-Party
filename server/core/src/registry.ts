// ゲームIDからGameModuleを引くテーブル。共通コアでゲームモジュールをimportしてよいのはこのファイルだけ（不変条件4、ADR-0009）
// キーがgameIdの正本である（モジュール側にidを持たせない）
import type { GameModule } from "@beb/shared-core";
import { detectivesModule } from "@beb/server-detectives";

export const registry: Record<string, GameModule<unknown, unknown, unknown>> = {
  detectives: detectivesModule as unknown as GameModule<unknown, unknown, unknown>,
};
