// チーム編成の性質を固定する。レベル差の大きい編成が出ること（ADR-0032が防ぐ問題）と、
// 許容幅が効かず毎回同じ編成になること（許容幅を設けた理由）の両方を検出する
import { describe, expect, it } from "vitest";
import { createRandom } from "./rng";
import { formBalancedTeams, isTogetherNatural, pairTeamSizes, TEAM_BALANCE_TOLERANCE } from "./teams";
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

// ペアの指定（ADR-0035）。指定した組が別のチームに割れること（指定が効かない）と、
// 指定しない場合の編成が変わること（既存の部屋の再現性を壊す）の両方を検出する
describe("formBalancedTeams の together", () => {
  function teamOf(teams: { id: string }[][], id: string): number {
    return teams.findIndex((team) => team.some((player) => player.id === id));
  }

  it("8人4ペアで4組すべてを指定すると、どのseedでも指定どおりのペアになる", () => {
    const players = makePlayers([1, 2, 3, 4, 5, 1, 2, 3]);
    const together: [string, string][] = [
      ["p0", "p7"],
      ["p1", "p6"],
      ["p2", "p5"],
      ["p3", "p4"],
    ];
    for (let seed = 1; seed <= 30; seed += 1) {
      const teams = formBalancedTeams(players, [2, 2, 2, 2], createRandom(seed), { together });
      for (const [a, b] of together) {
        expect(teamOf(teams, a)).toBe(teamOf(teams, b));
      }
    }
  });

  it("一部だけ指定すると、指定した組は必ず同じペアになり、残りは毎回同じとは限らない", () => {
    const players = makePlayers([3, 3, 3, 3, 3, 3, 3, 3]);
    const together: [string, string][] = [["p0", "p5"]];
    const rest = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const teams = formBalancedTeams(players, [2, 2, 2, 2], createRandom(seed), { together });
      expect(teamOf(teams, "p0")).toBe(teamOf(teams, "p5"));
      rest.add(canonical(teams));
    }
    expect(rest.size).toBeGreaterThan(1);
  });

  it("指定がレベルの偏りを大きくしても、指定を優先する", () => {
    // 5と5を組ませると合計の差は8になり、指定が無ければ許容幅（2）の外で選ばれない
    const players = makePlayers([5, 5, 1, 1]);
    for (let seed = 1; seed <= 20; seed += 1) {
      const teams = formBalancedTeams(players, [2, 2], createRandom(seed), { together: [["p0", "p1"]] });
      expect(teamOf(teams, "p0")).toBe(teamOf(teams, "p1"));
    }
  });

  it("指定した2人が3人組に入る編成も、指定を満たすとみなす", () => {
    const players = makePlayers([3, 3, 3, 3, 3, 3, 3]);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const teams = formBalancedTeams(players, [2, 2, 3], createRandom(seed), { together: [["p0", "p1"]] });
      const index = teamOf(teams, "p0");
      expect(index).toBe(teamOf(teams, "p1"));
      seen.add((teams[index] as unknown[]).length);
    }
    expect([...seen].sort()).toEqual([2, 3]);
  });

  it("参加者に居ないidを含む組は無視する", () => {
    const players = makePlayers([1, 2, 3, 4]);
    const plain = formBalancedTeams(players, [2, 2], createRandom(7));
    const withGhost = formBalancedTeams(players, [2, 2], createRandom(7), { together: [["p0", "ghost"]] });
    expect(canonical(withGhost)).toBe(canonical(plain));
  });

  it("すべては満たせない指定では、満たす組の数が最大の分け方を選ぶ", () => {
    const players = makePlayers([3, 3, 3, 3]);
    const together: [string, string][] = [
      ["p0", "p1"],
      ["p0", "p2"],
    ];
    for (let seed = 1; seed <= 20; seed += 1) {
      const teams = formBalancedTeams(players, [2, 2], createRandom(seed), { together });
      const satisfied = together.filter(([a, b]) => teamOf(teams, a) === teamOf(teams, b)).length;
      expect(satisfied).toBe(1);
    }
  });

  it("指定を省略しても空でも、同じseedなら従来と同じ編成を返す（既存の部屋の再現性）", () => {
    const players = makePlayers([1, 2, 3, 4, 5, 1, 2, 3]);
    for (let seed = 1; seed <= 10; seed += 1) {
      const omitted = formBalancedTeams(players, [2, 2, 2, 2], createRandom(seed));
      const empty = formBalancedTeams(players, [2, 2, 2, 2], createRandom(seed), { together: [] });
      expect(empty.map((team) => team.map((player) => player.id))).toEqual(
        omitted.map((team) => team.map((player) => player.id)),
      );
    }
  });
});

// ペア戦の人数構成と、指定の自然さの判定（ADR-0035の「伏せることの限界」）。
// 自動では出ない組を自然と判定すると裏画面が警告せず、主催者が気付かないまま見抜かれる
describe("pairTeamSizes", () => {
  it("2人組を並べ、奇数人数のときだけ最後を3人にする", () => {
    expect(pairTeamSizes(4)).toEqual([2, 2]);
    expect(pairTeamSizes(5)).toEqual([2, 3]);
    expect(pairTeamSizes(7)).toEqual([2, 2, 3]);
    expect(pairTeamSizes(8)).toEqual([2, 2, 2, 2]);
    expect(pairTeamSizes(1)).toEqual([]);
  });
});

describe("isTogetherNatural", () => {
  it("自動では選ばれない組（レベル5どうし）は自然でないと判定する", () => {
    const players = makePlayers([5, 5, 1, 1]);
    expect(isTogetherNatural(players, [2, 2], [["p0", "p1"]])).toBe(false);
    // 実際に、指定なしの自動編成ではp0とp1は一度も組まない
    for (let seed = 1; seed <= 50; seed += 1) {
      const teams = formBalancedTeams(players, [2, 2], createRandom(seed));
      expect(canonical(teams)).not.toContain("p0+p1");
    }
  });

  it("自動でも選ばれうる組は自然と判定する", () => {
    const players = makePlayers([5, 5, 1, 1]);
    expect(isTogetherNatural(players, [2, 2], [["p0", "p2"]])).toBe(true);
    expect(isTogetherNatural(makePlayers([3, 3, 3, 3, 3, 3]), [2, 2, 2], [["p0", "p5"]])).toBe(true);
  });

  it("1組ずつなら自然でも、組み合わせると自然でない場合を見分ける", () => {
    // 最小の偏りは1（例: 5+1、4+2、3+2）。5+2 と 4+3 はそれぞれ単独なら許容幅の内側だが、
    // 両方を指定すると残りが 2+1=3 になり、合計 7・7・3 の偏り4が許容幅（1+2=3）を超える
    const players = makePlayers([5, 4, 3, 2, 2, 1]);
    expect(isTogetherNatural(players, [2, 2, 2], [["p0", "p3"]])).toBe(true);
    expect(isTogetherNatural(players, [2, 2, 2], [["p1", "p2"]])).toBe(true);
    expect(
      isTogetherNatural(players, [2, 2, 2], [
        ["p0", "p3"],
        ["p1", "p2"],
      ]),
    ).toBe(false);
  });

  it("指定が無い・人数構成が合わない場合は自然とみなす", () => {
    const players = makePlayers([5, 5, 1, 1]);
    expect(isTogetherNatural(players, [2, 2], [])).toBe(true);
    expect(isTogetherNatural(players, [2, 2, 2], [["p0", "p1"]])).toBe(true);
  });

  it("許容幅の境界: 最小の偏り + 許容幅ちょうどの組は自然とみなす", () => {
    // 合計 5+2=7 と 4+1=5 の差は2（最小は 5+1 と 4+2 の差0）
    const players = makePlayers([5, 4, 2, 1]);
    expect(TEAM_BALANCE_TOLERANCE).toBe(2);
    expect(isTogetherNatural(players, [2, 2], [["p0", "p2"]])).toBe(true);
    // 5+4=9 と 2+1=3 の差6は外れる
    expect(isTogetherNatural(players, [2, 2], [["p0", "p1"]])).toBe(false);
  });
});
