// チーム編成。自己申告レベルの偏りが小さい分け方の中から、seedで1つを選ぶ（ADR-0032）。
//
// 共通コアに置く理由は、チーム戦の3本（MIND MELD、TWO-HEADED SPEAKER、SECRET TEAMS）が
// 着手時点で同じ実装を要するためである（ADR-0020の条件2）。扱うのはIDとレベルと人数構成だけで、
// チームの意味（ペア、陣営など）は呼び出し側が与える。ゲーム固有の語彙を含まない（不変条件4）。
import type { Level } from "./types";

/** 編成の追加条件 */
export interface FormBalancedTeamsOptions {
  /**
   * 同じチームに入れる2人の組（idで指定）。裏画面のペアの指定から渡る（ADR-0035）。
   * 参加者に居ないidを含む組は無視する
   */
  together?: readonly (readonly [string, string])[];
}

/** 最小の偏りに対する許容幅。合計レベルの尺度で数える（ADR-0032の暫定値） */
export const TEAM_BALANCE_TOLERANCE = 2;

// 浮動小数の比較の誤差。偏りは「合計×最大人数÷人数」で求めるため、割り切れない値が出る
const EPSILON = 1e-9;

/**
 * 参加者を `sizes` の人数構成でチームに分ける。
 *
 * 1. 同じ人数のチームの並べ替えを区別せずに、すべての分け方を列挙する
 * 2. `together` の組を満たす数が最大の分け方だけを残す。すべての組を満たす分け方があれば、それだけが残る
 * 3. チームごとの平均レベルに最大のチーム人数を掛けた値の、最大と最小の差を偏りとする
 * 4. 偏りが「最小の偏り + TEAM_BALANCE_TOLERANCE」以下の分け方から、`random` で1つを選ぶ
 * 5. チームの並び順を `random` で入れ替えて返す
 *
 * `together` を省略した場合、手順2は何も除かず、乱数の消費も変わらない。
 *
 * 全列挙の件数は8人で最大280通り（3・3・2人）であり、工夫せずに足りる（ADR-0032）。
 * 各チームの中の並びは入力の順を保つ。
 */
export function formBalancedTeams<T extends { id: string; level: Level }>(
  players: readonly T[],
  sizes: readonly number[],
  random: () => number,
  options: FormBalancedTeamsOptions = {},
): T[][] {
  for (const size of sizes) {
    if (!Number.isInteger(size) || size < 1) {
      throw new Error(`チームの人数は1以上の整数にする: ${size}`);
    }
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total !== players.length) {
    throw new Error(`チームの人数の合計(${total})が参加人数(${players.length})と一致しない`);
  }
  if (players.length === 0) {
    return [];
  }

  const maxSize = Math.max(...sizes);
  const together = resolveTogether(players, options.together ?? []);
  const all: { teams: number[][]; spread: number; satisfied: number }[] = [];
  for (const teams of enumeratePartitions(players.length, sizes)) {
    all.push({ teams, spread: spreadOf(teams, players, maxSize), satisfied: countSatisfied(teams, together) });
  }
  const maxSatisfied = Math.max(...all.map((candidate) => candidate.satisfied));
  const candidates = all.filter((candidate) => candidate.satisfied === maxSatisfied);

  const minSpread = Math.min(...candidates.map((candidate) => candidate.spread));
  const accepted = candidates.filter((candidate) => candidate.spread <= minSpread + TEAM_BALANCE_TOLERANCE + EPSILON);
  const chosen = accepted[Math.floor(random() * accepted.length)] ?? accepted[0];
  if (!chosen) {
    throw new Error("分け方の候補が無い");
  }

  // チームの並び順を入れ替える。列挙の順のままだと、最初のチームに入力の先頭の参加者が必ず入る
  const order = chosen.teams.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = order[i] as number;
    order[i] = order[j] as number;
    order[j] = a;
  }
  return order.map((index) => (chosen.teams[index] as number[]).map((playerIndex) => players[playerIndex] as T));
}

/**
 * ペア戦の人数構成。2人組を並べ、奇数人数のときだけ最後の組を3人にする。
 *
 * ペアの指定を使うゲーム（ADR-0035）はどれもこの構成で組むため、裏画面がゲームを問わず
 * 指定の自然さを判定できるよう共通コアに置く。各ゲームの人数構成の表がこれと一致することは、
 * そのゲームのテストが確かめる
 */
export function pairTeamSizes(count: number): number[] {
  if (!Number.isInteger(count) || count < 2) {
    return [];
  }
  const sizes = Array.from({ length: Math.floor(count / 2) }, () => 2);
  if (count % 2 === 1) {
    sizes[sizes.length - 1] = 3;
  }
  return sizes;
}

/**
 * `together` の組をすべて満たす分け方の中に、指定なしの自動編成でも選ばれうる分け方
 * （偏りが「最小の偏り + TEAM_BALANCE_TOLERANCE」以下）があるかを返す。
 *
 * false のとき、指定した組は自動編成では出ない。参加者は公開されているレベルから
 * 手で決めたことに気付きうる（ADR-0035の「伏せることの限界」）。裏画面が警告に使う
 */
export function isTogetherNatural<T extends { id: string; level: Level }>(
  players: readonly T[],
  sizes: readonly number[],
  together: readonly (readonly [string, string])[],
): boolean {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (players.length === 0 || total !== players.length) {
    return true;
  }
  const resolved = resolveTogether(players, together);
  if (resolved.length === 0) {
    return true;
  }
  const maxSize = Math.max(...sizes);
  let minSpread = Number.POSITIVE_INFINITY;
  let minSatisfyingSpread = Number.POSITIVE_INFINITY;
  for (const teams of enumeratePartitions(players.length, sizes)) {
    const spread = spreadOf(teams, players, maxSize);
    minSpread = Math.min(minSpread, spread);
    if (countSatisfied(teams, resolved) === resolved.length) {
      minSatisfyingSpread = Math.min(minSatisfyingSpread, spread);
    }
  }
  return minSatisfyingSpread <= minSpread + TEAM_BALANCE_TOLERANCE + EPSILON;
}

/** 組を添字の組に直す。参加者に居ないidを含む組と、同じ人の組は捨てる */
function resolveTogether<T extends { id: string }>(
  players: readonly T[],
  together: readonly (readonly [string, string])[],
): [number, number][] {
  const indexOf = new Map(players.map((player, index) => [player.id, index]));
  const resolved: [number, number][] = [];
  for (const [a, b] of together) {
    const ia = indexOf.get(a);
    const ib = indexOf.get(b);
    if (ia !== undefined && ib !== undefined && ia !== ib) {
      resolved.push([ia, ib]);
    }
  }
  return resolved;
}

/** 分け方が満たす組の数 */
function countSatisfied(teams: number[][], together: readonly [number, number][]): number {
  if (together.length === 0) {
    return 0;
  }
  const teamOf = new Map<number, number>();
  teams.forEach((team, teamIndex) => team.forEach((playerIndex) => teamOf.set(playerIndex, teamIndex)));
  return together.filter(([a, b]) => teamOf.get(a) === teamOf.get(b)).length;
}

/** 合計レベルの尺度にそろえた偏り。人数の違うチームは平均に最大人数を掛けて比べる */
function spreadOf<T extends { level: Level }>(teams: number[][], players: readonly T[], maxSize: number): number {
  const scores = teams.map((team) => {
    const sum = team.reduce((acc, index) => acc + (players[index] as T).level, 0);
    return (sum * maxSize) / team.length;
  });
  return Math.max(...scores) - Math.min(...scores);
}

/**
 * 参加者の添字 0..count-1 を `sizes` の人数構成に分ける分け方を、重複なく列挙する。
 *
 * 未割り当てのうち最小の添字の参加者を必ず次のチームに入れ、そのチームの人数は残っている人数の
 * 種類ごとに1回だけ試す。こうすると、同じ人数のチームを並べ替えただけの分け方は1回しか出ない。
 */
function* enumeratePartitions(count: number, sizes: readonly number[]): Generator<number[][]> {
  const remainingSizes = new Map<number, number>();
  for (const size of sizes) {
    remainingSizes.set(size, (remainingSizes.get(size) ?? 0) + 1);
  }
  const teams: number[][] = [];

  function* fill(unassigned: number[]): Generator<number[][]> {
    if (unassigned.length === 0) {
      yield teams.map((team) => [...team]);
      return;
    }
    const [first, ...rest] = unassigned as [number, ...number[]];
    for (const [size, left] of [...remainingSizes.entries()]) {
      if (left === 0) {
        continue;
      }
      remainingSizes.set(size, left - 1);
      for (const mates of combinations(rest, size - 1)) {
        teams.push([first, ...mates]);
        const mateSet = new Set(mates);
        yield* fill(rest.filter((index) => !mateSet.has(index)));
        teams.pop();
      }
      remainingSizes.set(size, left);
    }
  }

  yield* fill(Array.from({ length: count }, (_, index) => index));
}

/** itemsからk個を選ぶ組み合わせ。入力の順を保つ */
function* combinations(items: readonly number[], k: number, start = 0): Generator<number[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= items.length - k; i += 1) {
    for (const tail of combinations(items, k - 1, i + 1)) {
      yield [items[i] as number, ...tail];
    }
  }
}
