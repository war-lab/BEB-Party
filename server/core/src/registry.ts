// ゲームIDからGameModuleを引くテーブル。共通コアでゲームモジュールをimportしてよいのはこのファイルだけ（不変条件4、ADR-0009）
// キーがgameIdの正本である（モジュール側にidを持たせない）
import type { GameModule } from "@beb/shared-core";
import { detectivesModule } from "@beb/server-detectives";
import { dontSayItModule } from "@beb/server-dontsayit";
import { rankingModule } from "@beb/server-ranking";

export const registry: Record<string, GameModule<unknown, unknown, unknown>> = {
  detectives: detectivesModule as unknown as GameModule<unknown, unknown, unknown>,
  dontsayit: dontSayItModule as unknown as GameModule<unknown, unknown, unknown>,
  ranking: rankingModule as unknown as GameModule<unknown, unknown, unknown>,
};
