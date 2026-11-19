// 部屋コード・プレイヤーID・再接続トークン・シードの採番

// 紛らわしい文字(I, O, 0, 1)を除いた英大文字+数字(32文字)（基本設計/01_サーバ.md）
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

export function generatePlayerId(): string {
  return crypto.randomUUID();
}

// 128bit以上の乱数(ADR-0006)。連番・部屋コード由来にしない
export function generateReconnectToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// GameModule.startへ注入する乱数シード(基本設計/05_ゲームモジュール.md)
/**
 * ゲーム開始時の seed。128bit（32bit×4）を暗号論的乱数から作る（ADR-0036）。
 * 32bit では公開された並びから総当たりで状態を復元でき、同じ乱数列で作った秘密が割れた
 */
export function generateSeed(): readonly [number, number, number, number] {
  const words = crypto.getRandomValues(new Uint32Array(4));
  return [words[0] as number, words[1] as number, words[2] as number, words[3] as number];
}
