// 顔アイコンの絵文字をplayerIdから引く。
//
// ロビーとホスト画面はPlayerオブジェクトを持つので `playerIconEmoji(player.icon)` で足りるが、
// ゲーム画面はgameStateのplayerIdしか持たない。共通コアが受信済みのroomから引いて渡す
// （ゲームモジュールがアイコンの対応表を持たないようにするため。不変条件4）
import { playerIconEmoji } from "@beb/shared-core";
import { serverState } from "./stores/server-state.svelte";

/** 該当プレイヤーがstateに居ない場合は空文字を返す（円だけを描いて絵文字を出さない） */
export function playerIconOf(playerId: string): string {
  const player = serverState.room?.players.find((candidate) => candidate.id === playerId);
  return player ? playerIconEmoji(player.icon) : "";
}
