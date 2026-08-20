// 顔アイコンの画像URLをIDまたはplayerIdから引く。
//
// 画像は `client/public/player-icons/<id>.png`（64x64）に置く。素材の出所は
// `client/app/icons-source/README.md` を正とする。
// プロトコルに載るのはIDだけで、URLの組み立てはこの表示層に閉じる（ADR-0022）
import { isPlayerIconId, playerIconLabel } from "@beb/shared-core";
import { serverState } from "./stores/server-state.svelte";

export interface PlayerIconImage {
  src: string;
  /** 読み上げ用。装飾として描く場合は空文字を渡して隠す */
  labelJa: string;
}

/** IDから画像を引く。未知のIDはnullを返す（円だけを描いて画像を出さない） */
export function playerIconImage(iconId: string | undefined): PlayerIconImage | null {
  if (!isPlayerIconId(iconId)) {
    return null;
  }
  return { src: `/player-icons/${iconId}.png`, labelJa: playerIconLabel(iconId) };
}

/**
 * playerIdから画像を引く。
 *
 * ゲーム画面はgameStateのplayerIdしか持たないため、共通コアが受信済みのroomから引いて渡す
 * （ゲームモジュールがアイコンの対応表を持たないようにするため。不変条件4）
 */
export function playerIconOf(playerId: string): PlayerIconImage | null {
  const player = serverState.room?.players.find((candidate) => candidate.id === playerId);
  return playerIconImage(player?.icon);
}
