// 参加者タイルのアイコン色。キャラクターセレクト風の見た目にするため、
// playerIdから決まる色を割り当てる（サーバから色は配らない。表示のためだけの派生値）
const FACE_COLORS = ["#ff8a65", "#4dd0e1", "#aed581", "#ba68c8", "#ffd54f", "#f06292", "#7986cb", "#4db6ac"];

export function faceColor(playerId: string): string {
  let hash = 0;
  for (const char of playerId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100_000;
  }
  return FACE_COLORS[hash % FACE_COLORS.length] as string;
}
