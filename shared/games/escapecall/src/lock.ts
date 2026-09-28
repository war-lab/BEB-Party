// 錠の生成と断片の割り当て（基本設計/13_ESCAPECALLゲームモジュール.md の錠の仕組み、ADR-0027）。
//
// 答えを先に決めて逆算しない。並び・規則・対応表を決めてから答えを計算するため、
// 生成した錠には必ず答えがあり、それは1つに決まる。生成が満たす不変条件はユニットテストで固定する。
// 乱数は共通コアが注入した seed から作ったものだけを受け取る（基本設計/05の呼び出し規約）。
import { shuffle, type Level } from "@beb/shared-core";
import {
  RULE_IDS,
  RULE_TARGET,
  SKIPPED_SYMBOL_COUNT,
  SKIP_RULE_IDS,
  computeCode,
  isSkippedBy,
  type RuleId,
  type RuleSpec,
} from "./rules";
import { COLOR_IDS, SHAPE_IDS, SYMBOL_IDS, type SymbolId } from "./symbols";

/** 錠の数。錠ごとに規則と桁が増える（13の錠ごとの難度） */
export const LOCK_COUNT = 3;

export interface LockSpec {
  ruleCount: number;
  codeLength: number;
  /** 対応表の記号数 */
  mapSize: number;
  /**
   * 対応表に含める、並びに現れない記号の下限。
   * 並びに出る記号だけの表だと、表を全部読み上げれば済み、並びを聞く理由が消える（13の錠ごとの難度）
   */
  minExtraSymbols: number;
}

export const LOCK_SPECS: readonly LockSpec[] = [
  { ruleCount: 0, codeLength: 4, mapSize: 6, minExtraSymbols: 2 },
  { ruleCount: 1, codeLength: 4, mapSize: 8, minExtraSymbols: 1 },
  { ruleCount: 2, codeLength: 5, mapSize: 8, minExtraSymbols: 1 },
];

export interface MapEntry {
  symbol: SymbolId;
  digit: string;
}

/** 生成した錠1つ。ゲーム秘密状態にだけ置く（ADR-0003） */
export interface GeneratedLock {
  /** 錠に描かれた記号の列（左から右）。除かれる記号を含む */
  order: SymbolId[];
  /** 対応表。表示順はシャッフル済み */
  map: MapEntry[];
  /** 適用する順。記号に作用する規則を前に並べてある */
  rules: RuleSpec[];
  code: string;
}

// --- 断片 ---

export type PieceKind = "order" | "map" | "rule";

/** 並びと対応表の分け方。4人卓などで半分に分けたときに、どちらの半分かを持つ（13の断片の割り当て） */
export type PiecePart = "whole" | "front" | "back";

export interface OrderPiece {
  kind: "order";
  part: PiecePart;
  symbols: SymbolId[];
}

export interface MapPiece {
  kind: "map";
  part: PiecePart;
  entries: MapEntry[];
}

/** 規則1件と、規則を持つ人のレベルで組み立てた英文 */
export type RuleEntry = RuleSpec & {
  textEn: string;
  /** 規則を持つ人のレベルが1〜2のときだけ入れる（13のレベル差の吸収の第2層） */
  textJa?: string;
};

export interface RulePiece {
  kind: "rule";
  /** 適用する順 */
  rules: RuleEntry[];
}

export type Piece = OrderPiece | MapPiece | RulePiece;

// --- 生成 ---

function pickOne<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] as T;
}

/**
 * 規則を選ぶ。錠3は2つとし、除く規則を1つまで、同じ規則IDを2度使わない。
 * 記号に作用する規則を前に並べる（13の規則、生成の手順1）。
 */
function pickRules(ruleCount: number, random: () => number): RuleSpec[] {
  const chosen: RuleId[] = [];
  for (const ruleId of shuffle(RULE_IDS, random)) {
    if (chosen.length >= ruleCount) {
      break;
    }
    if (SKIP_RULE_IDS.includes(ruleId) && chosen.some((entry) => SKIP_RULE_IDS.includes(entry))) {
      continue;
    }
    chosen.push(ruleId);
  }
  const specs: RuleSpec[] = chosen.map((ruleId) => {
    if (ruleId === "skip_color") {
      return { ruleId, param: pickOne(COLOR_IDS, random) };
    }
    if (ruleId === "skip_shape") {
      return { ruleId, param: pickOne(SHAPE_IDS, random) };
    }
    return { ruleId } as RuleSpec;
  });
  // 安定ソートで記号の規則を前へ。同じ作用先の中は選んだ順を保つ
  return [...specs].sort(
    (a, b) => (RULE_TARGET[a.ruleId] === "symbol" ? 0 : 1) - (RULE_TARGET[b.ruleId] === "symbol" ? 0 : 1),
  );
}

/** 錠を1つ生成する（13の生成の手順1〜7） */
export function generateLock(spec: LockSpec, random: () => number): GeneratedLock {
  const rules = pickRules(spec.ruleCount, random);
  const skipRule = rules.find((rule) => SKIP_RULE_IDS.includes(rule.ruleId));

  // 答えになる記号は、除く対象に当たらない記号から重複なしで選ぶ
  const kept = SYMBOL_IDS.filter((symbol) => skipRule === undefined || !isSkippedBy(skipRule, symbol));
  const codeSymbols = shuffle(kept, random).slice(0, spec.codeLength);

  // 除く規則があれば、除く対象に当たる記号を2個、任意の位置へ挿入する
  let order = [...codeSymbols];
  if (skipRule !== undefined) {
    const skipped = shuffle(
      SYMBOL_IDS.filter((symbol) => isSkippedBy(skipRule, symbol)),
      random,
    ).slice(0, SKIPPED_SYMBOL_COUNT);
    for (const symbol of skipped) {
      const position = Math.floor(random() * (order.length + 1));
      order = [...order.slice(0, position), symbol, ...order.slice(position)];
    }
  }

  // 対応表は、並びの記号に並びに無い記号を足して所定の数まで埋める
  const extras = shuffle(
    SYMBOL_IDS.filter((symbol) => !order.includes(symbol)),
    random,
  ).slice(0, Math.max(spec.mapSize - order.length, spec.minExtraSymbols));
  const digits = shuffle(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], random);
  const map = shuffle([...order, ...extras], random).map((symbol, index) => ({
    symbol,
    digit: digits[index] as string,
  }));

  const code = computeCode(order, rules, new Map(map.map((entry) => [entry.symbol, entry.digit])));
  if (code === undefined) {
    // 対応表は並びの全記号を含むため到達しない。到達したら生成器の不具合である
    throw new Error("生成した錠の答えが計算できない");
  }
  return { order, map, rules, code };
}

/** 3つの錠をまとめて生成する。handleActionにシードが渡らないため、startで全部決める（13の生成） */
export function generateLocks(random: () => number): GeneratedLock[] {
  return LOCK_SPECS.map((spec) => generateLock(spec, random));
}

// --- 断片の割り当て ---

/** 答えに使う記号（除く規則を適用した後に残る記号） */
export function usedSymbolsOf(lock: GeneratedLock): SymbolId[] {
  return lock.order.filter((symbol) => !lock.rules.some((rule) => isSkippedBy(rule, symbol)));
}

/**
 * 対応表を前半と後半に分ける。どちらにも答えに使う記号を1個以上含める。
 * 片方が答えに使わない記号だけになると、その人の断片を欠いても解けてしまう（13の断片の割り当て）。
 */
function splitMap(lock: GeneratedLock, random: () => number): [MapEntry[], MapEntry[]] {
  const used = new Set(usedSymbolsOf(lock));
  const usedEntries = shuffle(
    lock.map.filter((entry) => used.has(entry.symbol)),
    random,
  );
  const rest = shuffle(
    lock.map.filter((entry) => !usedEntries.slice(0, 2).includes(entry)),
    random,
  );
  const front: MapEntry[] = [usedEntries[0] as MapEntry];
  const back: MapEntry[] = [usedEntries[1] as MapEntry];
  for (const entry of rest) {
    (front.length <= back.length ? front : back).push(entry);
  }
  return [shuffle(front, random), shuffle(back, random)];
}

/** 並びを左から順に前半と後半に分ける */
function splitOrder(order: readonly SymbolId[]): [SymbolId[], SymbolId[]] {
  const middle = Math.ceil(order.length / 2);
  return [order.slice(0, middle), order.slice(middle)];
}

type Slot = "order" | "orderFront" | "orderBack" | "map" | "mapFront" | "mapBack" | "rule";

/**
 * 人数と錠ごとの断片の割り当て（13の断片の割り当ての表）。
 * 外側の配列の順がレベルの降順（A〜D）に対応する。
 */
function slotsFor(playerCount: number, lockIndex: number): Slot[][] {
  const hasRule = (LOCK_SPECS[lockIndex]?.ruleCount ?? 0) > 0;
  if (playerCount <= 2) {
    return hasRule ? [["order", "rule"], ["map"]] : [["order"], ["map"]];
  }
  if (playerCount === 3) {
    return hasRule ? [["rule"], ["order"], ["map"]] : [["order"], ["mapFront"], ["mapBack"]];
  }
  return hasRule
    ? [["rule"], ["order"], ["mapFront"], ["mapBack"]]
    : [["orderFront"], ["orderBack"], ["mapFront"], ["mapBack"]];
}

export interface Participant {
  id: string;
  level: Level;
}

/**
 * 参加者をレベルの降順に並べる。同じレベルの中は seed でシャッフルする。
 * 全員が同じレベルの卓で、同じ人が3つの錠すべてで規則を持つことを避ける（13のレベル差の吸収の第1層）。
 */
export function rankByLevel(participants: readonly Participant[], random: () => number): Participant[] {
  return shuffle(participants, random)
    .map((participant, index) => ({ participant, index }))
    .sort((a, b) => b.participant.level - a.participant.level || a.index - b.index)
    .map((entry) => entry.participant);
}

/** 規則の英文を組み立てる関数。コンテンツの言い回しを知るサーバ側が渡す */
export type RuleTextOf = (rule: RuleSpec, level: Level) => { textEn: string; textJa?: string };

/**
 * 錠1つの断片を参加者へ割り当てる。
 *
 * 規則の英文は、規則を持つ人のレベルで組み立てる（13のレベル差の吸収の第2層）。
 */
export function assignPieces(
  lock: GeneratedLock,
  lockIndex: number,
  participants: readonly Participant[],
  random: () => number,
  ruleTextOf: RuleTextOf,
): Record<string, Piece[]> {
  const ranked = rankByLevel(participants, random);
  const slots = slotsFor(ranked.length, lockIndex);
  const [mapFront, mapBack] = splitMap(lock, random);
  const [orderFront, orderBack] = splitOrder(lock.order);

  const assignments: Record<string, Piece[]> = {};
  ranked.forEach((participant, index) => {
    const pieces: Piece[] = [];
    for (const slot of slots[index] ?? []) {
      switch (slot) {
        case "order":
          pieces.push({ kind: "order", part: "whole", symbols: [...lock.order] });
          break;
        case "orderFront":
          pieces.push({ kind: "order", part: "front", symbols: orderFront });
          break;
        case "orderBack":
          pieces.push({ kind: "order", part: "back", symbols: orderBack });
          break;
        case "map":
          pieces.push({ kind: "map", part: "whole", entries: shuffle(lock.map, random) });
          break;
        case "mapFront":
          pieces.push({ kind: "map", part: "front", entries: mapFront });
          break;
        case "mapBack":
          pieces.push({ kind: "map", part: "back", entries: mapBack });
          break;
        case "rule":
          pieces.push({
            kind: "rule",
            rules: lock.rules.map((rule) => ({ ...rule, ...ruleTextOf(rule, participant.level) })),
          });
          break;
      }
    }
    assignments[participant.id] = pieces;
  });
  return assignments;
}

/**
 * 与えられた断片だけから答えを計算する。断片が足りなければ undefined を返す。
 *
 * 生成のテストで「どの参加者の断片を外しても解けない」ことを確かめるために使う（13の生成）。
 * 規則の数は錠の番号から決まる公開情報であり、規則の断片が欠けていれば答えを返さない。
 */
export function solveFromPieces(pieces: readonly Piece[], lockIndex: number): string | undefined {
  const orders = pieces.filter((piece): piece is OrderPiece => piece.kind === "order");
  const whole = orders.find((piece) => piece.part === "whole");
  const front = orders.find((piece) => piece.part === "front");
  const back = orders.find((piece) => piece.part === "back");
  const order = whole?.symbols ?? (front && back ? [...front.symbols, ...back.symbols] : undefined);
  if (order === undefined) {
    return undefined;
  }

  const rules = pieces.flatMap((piece) => (piece.kind === "rule" ? piece.rules : []));
  if (rules.length < (LOCK_SPECS[lockIndex]?.ruleCount ?? 0)) {
    return undefined;
  }

  const map = new Map<SymbolId, string>();
  for (const piece of pieces) {
    if (piece.kind === "map") {
      for (const entry of piece.entries) {
        map.set(entry.symbol, entry.digit);
      }
    }
  }
  return computeCode(order, rules, map);
}

/** その錠で誰がどの種類の断片を持つか。公開状態に載せる形（中身を含めない） */
export function kindsOf(pieces: readonly Piece[]): PieceKind[] {
  return [...new Set(pieces.map((piece) => piece.kind))];
}
