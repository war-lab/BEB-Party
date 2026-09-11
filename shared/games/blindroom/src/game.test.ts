import { describe, expect, it } from "vitest";
import { emptyBoard } from "./board";
import {
  BUILDING_SECONDS,
  STAGES,
  STAGE_LABELS_JA,
  describerPlayerIdOf,
  describerPointsOf,
  hintCountFor,
  isFinalRound,
  pointsOf,
  type BlindRoomPublic,
} from "./game";

function publicStateOf(roundIndex: number, totalRounds: number, order: string[]): BlindRoomPublic {
  return {
    packId: "room",
    roundIndex,
    totalRounds,
    describerOrder: order,
    itemSetId: "room_easy",
    palette: [],
    placeCount: 5,
    readyPlayerIds: [],
    donePlayerIds: [],
    keyExpressions: [],
    rounds: [],
    scores: [],
    buildingSeconds: BUILDING_SECONDS.default,
  };
}

describe("describerPlayerIdOf", () => {
  it("そのラウンドの説明者を返す", () => {
    const state = publicStateOf(1, 3, ["a", "b", "c"]);
    expect(describerPlayerIdOf(state)).toBe("b");
  });

  it("範囲外ではundefinedを返す", () => {
    expect(describerPlayerIdOf(publicStateOf(3, 3, ["a", "b", "c"]))).toBeUndefined();
  });
});

describe("describerPointsOf", () => {
  it("聞き手の一致数の平均を切り捨てる", () => {
    expect(describerPointsOf([5, 4, 4])).toBe(4);
    expect(describerPointsOf([5, 5, 5])).toBe(5);
    expect(describerPointsOf([1, 0])).toBe(0);
  });

  it("聞き手が0人なら0点になる", () => {
    expect(describerPointsOf([])).toBe(0);
  });
});

describe("hintCountFor", () => {
  it("レベル1〜2に4件、3以上に2件を渡す", () => {
    expect(hintCountFor(1)).toBe(4);
    expect(hintCountFor(2)).toBe(4);
    expect(hintCountFor(3)).toBe(2);
    expect(hintCountFor(5)).toBe(2);
  });
});

describe("isFinalRound / pointsOf", () => {
  it("最終ラウンドを判定する", () => {
    expect(isFinalRound(publicStateOf(1, 3, []))).toBe(false);
    expect(isFinalRound(publicStateOf(2, 3, []))).toBe(true);
  });

  it("未登録のプレイヤーは0点として扱う", () => {
    expect(pointsOf([{ playerId: "a", points: 3 }], "a")).toBe(3);
    expect(pointsOf([{ playerId: "a", points: 3 }], "b")).toBe(0);
  });
});

describe("STAGE_LABELS_JA", () => {
  it("すべてのステージに文言がある", () => {
    for (const stage of Object.values(STAGES)) {
      expect(STAGE_LABELS_JA[stage]).toBeTruthy();
    }
  });
});

describe("emptyBoard との組み合わせ", () => {
  it("初期の盤面は空である（秘密情報の初期値）", () => {
    expect(emptyBoard().every((cell) => cell === null)).toBe(true);
  });
});
