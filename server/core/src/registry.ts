// ゲームIDからGameModuleを引くテーブル。共通コアでゲームモジュールをimportしてよいのはこのファイルだけ（不変条件4、ADR-0009）
// キーがgameIdの正本である（モジュール側にidを持たせない）
import type { GameModule } from "@beb/shared-core";
import { blindRoomModule } from "@beb/server-blindroom";
import { detectivesModule } from "@beb/server-detectives";
import { dontSayItModule } from "@beb/server-dontsayit";
import { rankingModule } from "@beb/server-ranking";
import { whoWroteThisModule } from "@beb/server-whowrotethis";

// キーの順がロビーのゲーム選択と遊び方タブの並びになる。収録順で並べ、先頭はMVPのDETECTIVESとする
export const registry: Record<string, GameModule<unknown, unknown, unknown>> = {
  detectives: detectivesModule as unknown as GameModule<unknown, unknown, unknown>,
  dontsayit: dontSayItModule as unknown as GameModule<unknown, unknown, unknown>,
  ranking: rankingModule as unknown as GameModule<unknown, unknown, unknown>,
  whowrotethis: whoWroteThisModule as unknown as GameModule<unknown, unknown, unknown>,
  blindroom: blindRoomModule as unknown as GameModule<unknown, unknown, unknown>,
};
