// チーム編成の性質を固定する。レベル差の大きい編成が出ること（ADR-0032が防ぐ問題）と、
// 許容幅が効かず毎回同じ編成になること（許容幅を設けた理由）の両方を検出する
import { describe, expect, it } from "vitest";
import { createRandom } from "./rng";
import { formBalancedTeams, TEAM_BALANCE_TOLERANCE } from "./teams";
import type { Level } from "./types";

function makePlayers(levels: number[]): { id: string; level: Level }[] {
  return levels.map((level, index) => ({ id: `p${index}`, level: level as Level }));
}

/** 編成を順序に依存しない文字列にする。同じ分け方かどうかの比較に使う */
function canonical(teams: { id: string }[][]): string {
  return teams
    .map((team) => team.map((player) => player.id).sort().join("+"))
    .sort()
    .join(" | ");
}

function sums(teams: { level: Level }[][]): number[] {
  return teams.map((team) => team.reduce((acc, player) => acc + player.level, 0));
}

describe("formBalancedTeams", () => {
  it("全員をちょうど1回ずつ、指定した人数構成で割り当てる", () => {
    const players = makePlayers([1, 2, 3, 4, 5, 3, 2, 4]);
    for (const sizes of [[2, 2, 2, 2], [4, 4], [3, 3, 2], [2, 3, 3]]) {
      const teams = formBalancedTeams(players, sizes, createRandom(7));
      expect(teams.map((team) => team.length).sort()).toEqual([...sizes].sort());
      expect(teams.flat().map((player) => player.id).sort()).toEqual(players.map((player) => player.id).sort());
    }
  });

  it("同じseedからは同じ編成を返す（再現性）", () => {
    const players = makePlayers([5, 4, 3, 3, 2, 1]);
    const a = formBalancedTeams(players, [2, 2, 2], createRandom(99));
    const b = formBalancedTeams(players, [2, 2, 2], createRandom(99));
    expect(a).toEqual(b);
  });

  it("許容幅を超えるレベルの偏りを出さない", () => {
    // 5,5,1,1 を2ペアに分けると、最小の偏りは0（5と1、5と1）。5と5、1と1（差8）は出てはならない
    const players = makePlayers([5, 5, 1, 1]);
    for (let seed = 0; seed < 200; seed += 1) {
      const teams = formBalancedTeams(players, [2, 2], createRandom(seed));
      const [a, b] = sums(teams);
      expect(Math.abs((a as number) - (b as number))).toBeLessThanOrEqual(TEAM_BALANCE_TOLERANCE);
    }
  });

  it("許容幅の内側にある編成はどれも選ばれうる（毎回同じペアにならない）", () => {
    // 5,4,2,1: 「5+1, 4+2」（差0）と「5+2, 4+1」（差2）が候補。「5+4, 2+1」（差6）は候補外
    const players = makePlayers([5, 4, 2, 1]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      seen.add(canonical(formBalancedTeams(players, [2, 2], createRandom(seed))));
    }
    expect(seen).toEqual(new Set(["p0+p2 | p1+p3", "p0+p3 | p1+p2"]));
  });

  it("全員が同じレベルなら、すべての分け方が候補になる", () => {
    // 6人を3ペアに分ける分け方は15通り
    const players = makePlayers([3, 3, 3, 3, 3, 3]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 2000; seed += 1) {
      seen.add(canonical(formBalancedTeams(players, [2, 2, 2], createRandom(seed))));
    }
    expect(seen.size).toBe(15);
  });

  it("人数の違うチームは平均レベルで比べる", () => {
    // 5,1,3 を [2,1] に分ける。平均×2で比べると「5+1 | 3」が差0で最小。
    // 合計で比べると「5+1 | 3」は差3になり、平均で比べていないことを検出できる
    const players = makePlayers([5, 1, 3]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      seen.add(canonical(formBalancedTeams(players, [2, 1], createRandom(seed))));
    }
    // 候補: 「5+1 | 3」(6 vs 6 → 0)。「5+3 | 1」(8 vs 2 → 6)、「1+3 | 5」(4 vs 10 → 6) は候補外
    expect(seen).toEqual(new Set(["p0+p1 | p2"]));
  });

  it("チームの並び順も入れ替わる（先頭の参加者が常に最初のチームに入らない）", () => {
    const players = makePlayers([3, 3, 3, 3]);
    const firstTeamHasP0 = new Set<boolean>();
    for (let seed = 0; seed < 100; seed += 1) {
      const teams = formBalancedTeams(players, [2, 2], createRandom(seed));
      firstTeamHasP0.add(teams[0]?.some((player) => player.id === "p0") ?? false);
    }
    expect(firstTeamHasP0).toEqual(new Set([true, false]));
  });

  it("人数構成の合計が参加人数と合わなければ例外を投げる", () => {
    expect(() => formBalancedTeams(makePlayers([1, 2, 3]), [2, 2], createRandom(1))).toThrow();
    expect(() => formBalancedTeams(makePlayers([1, 2]), [2, 0], createRandom(1))).toThrow();
  });

  it("8人の最大構成でも全列挙が終わる", () => {
    const players = makePlayers([1, 2, 3, 4, 5, 1, 2, 3]);
    const started = Date.now();
    formBalancedTeams(players, [3, 3, 2], createRandom(1));
    formBalancedTeams(players, [2, 2, 2, 2], createRandom(1));
    expect(Date.now() - started).toBeLessThan(500);
  });
});
