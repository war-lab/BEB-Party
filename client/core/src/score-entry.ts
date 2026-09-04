// 得点表が受け取る1人分の得点。
//
// 得点を持つゲームの型（RankingPublic.scores 等）は構造が同じであり、この形で受ける。
// 得点の意味・加点の規則はゲームモジュールが決め、共通コアは並べて描くだけとする（ADR-0020）。
export interface ScoreEntry {
  playerId: string;
  points: number;
}
