// 話す順・順位・山札の下限など、サーバと画面が同じ式を使う部分（基本設計/16のテスト観点「話す順」「結果」）
import { describe, expect, it } from "vitest";
import {
  MAX_CARDS_PER_TURN,
  MAX_TEAMS,
  MIN_CARDS,
  TEAM_SIZES,
  advancesOf,
  explainerTeamIdOf,
  isExplainer,
  lapsOf,
  pairLabelOf,
  placesOf,
  speakingOrderOf,
  teamOfPlayer,
  type TwoHeadedPublic,
} from "./game";

describe("speakingOrderOf", () => {
  it("2人のペアではお題ごとに先に話す人が入れ替わる", () => {
    expect(speakingOrderOf(["a", "b"], 0)).toEqual(["a", "b"]);
    expect(speakingOrderOf(["a", "b"], 1)).toEqual(["b", "a"]);
    expect(speakingOrderOf(["a", "b"], 2)).toEqual(["a", "b"]);
  });

  it("3人組では3人が順に先頭になる", () => {
    expect(speakingOrderOf(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
    expect(speakingOrderOf(["a", "b", "c"], 1)).toEqual(["b", "c", "a"]);
    expect(speakingOrderOf(["a", "b", "c"], 2)).toEqual(["c", "a", "b"]);
    expect(speakingOrderOf(["a", "b", "c"], 3)).toEqual(["a", "b", "c"]);
  });

  it("入力の並びを壊さない", () => {
    const members = ["a", "b"];
    speakingOrderOf(members, 1);
    expect(members).toEqual(["a", "b"]);
  });

  it("空のペアには空の列を返す", () => {
    expect(speakingOrderOf([], 3)).toEqual([]);
  });
});

describe("placesOf", () => {
  it("点の高い順に順位を振り、同点は同じ順位にする", () => {
    const places = placesOf([
      { teamId: "t1", points: 3 },
      { teamId: "t2", points: 5 },
      { teamId: "t3", points: 3 },
      { teamId: "t4", points: 1 },
    ]);
    expect(places.get("t2")).toBe(1);
    expect(places.get("t1")).toBe(2);
    expect(places.get("t3")).toBe(2);
    expect(places.get("t4")).toBe(4);
  });
});

describe("ペアと説明役", () => {
  const publicState = {
    teams: [
      { teamId: "t1", members: ["p1", "p2"] },
      { teamId: "t2", members: ["p3", "p4", "p5"] },
    ],
    turnOrder: ["t1", "t2", "t1", "t2"],
    turnIndex: 1,
    solvedThisTurn: 2,
    passedThisTurn: 1,
  } as unknown as TwoHeadedPublic;

  it("turnOrder と turnIndex から説明役のペアを導く", () => {
    expect(explainerTeamIdOf(publicState)).toBe("t2");
    expect(isExplainer(publicState, "p4")).toBe(true);
    expect(isExplainer(publicState, "p1")).toBe(false);
    expect(isExplainer(publicState, null)).toBe(false);
  });

  it("参加者のペアと表示名を引く", () => {
    expect(teamOfPlayer(publicState.teams, "p5")?.teamId).toBe("t2");
    expect(teamOfPlayer(publicState.teams, "p9")).toBeUndefined();
    expect(pairLabelOf(publicState.teams, "t2")).toBe("ペア2");
  });

  it("送った回数は正解と送りの合計である", () => {
    expect(advancesOf(publicState)).toBe(3);
  });
});

describe("定数", () => {
  it("6〜8人のペアの人数構成は人数と一致し、7人だけ3人組を含む", () => {
    for (const [count, sizes] of Object.entries(TEAM_SIZES)) {
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(Number(count));
      expect(sizes.filter((size) => size === 3)).toHaveLength(Number(count) === 7 ? 1 : 0);
    }
    expect(Object.keys(TEAM_SIZES).map(Number)).toEqual([6, 7, 8]);
  });

  it("山札の下限は消費上限 × ペアの数の上限 × 周回数の上限（40枚）である（16の検証4）", () => {
    expect(MAX_TEAMS).toBe(4);
    expect(MIN_CARDS).toBe(MAX_CARDS_PER_TURN * 4 * 2);
    expect(MIN_CARDS).toBe(40);
  });

  it("周回数の既定は2周で、未知の値は既定へ落とす", () => {
    expect(lapsOf(undefined)).toBe(2);
    expect(lapsOf("1")).toBe(1);
    expect(lapsOf("x")).toBe(2);
  });
});
