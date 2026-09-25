// ロビーのゲーム一覧の並び。現在の参加人数で遊べるゲームを上に、遊べないゲームを下に置く（ADR-0026）。
// 判定はplayerCountだけで行い、ゲーム固有の概念を共通コアへ持ち込まない（不変条件4）
export interface OrderedGame<T> {
  game: T;
  /** 現在の参加人数が対応人数の範囲内にあるか */
  playable: boolean;
}

export function orderGamesByPlayerCount<T extends { playerCount: [number, number] }>(
  games: readonly T[],
  count: number,
): OrderedGame<T>[] {
  const entries = games.map((game) => ({
    game,
    playable: count >= game.playerCount[0] && count <= game.playerCount[1],
  }));
  // 各グループの中はカタログの順を保つ。人数が変わるたびに同じグループ内まで入れ替わらないようにする
  return [...entries.filter((entry) => entry.playable), ...entries.filter((entry) => !entry.playable)];
}
