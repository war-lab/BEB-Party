// 再接続時の秘密情報の作り直し（rebuildSecret）のテスト（ADR-0029、基本設計/16の「再接続での作り直し」）。
//
// 共通コアは再接続した人へ、保存済みの値ではなく rebuildSecret の戻り値を送る。
// 作り直した値が最後に送った値と食い違うと、再接続した説明役のお題が消えたり別のお題に変わったりする。
// これを防ぐため、遷移が返した secrets を共通コアと同じく上書きで溜め、各遷移の直後に全員分を突き合わせる。
//
// コンテンツ欠落の検査にはセットの差し替えが要る。vi.mock はファイル単位で効くため、モジュールテスト本体とはファイルを分ける。
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Level } from "@beb/shared-core";
import { MAX_CARDS_PER_TURN, STAGES, type TwoHeadedSecret, type TwoHeadedSet } from "@beb/shared-twoheaded";
import {
  claim,
  expire,
  explainersOf,
  pass,
  readyAll,
  roomOf,
  setConnected,
  startLive,
  startTurn,
  type Live,
} from "./test-support/harness";

const LARGE_SET_ID = "fixture_set_v1";
const SMALL_SET_ID = "fixture_small_v1";

// テストがセットを差し替えられるよう、findSet が引く先を可変にしておく
const registry = vi.hoisted(() => ({ sets: new Map<string, TwoHeadedSet>(), originals: new Map<string, TwoHeadedSet>() }));

vi.mock("./sets", async () => {
  const { validSet } = await import("./test-support/fixtures");
  const { MIN_CARDS } = await import("@beb/shared-twoheaded");
  const large = validSet(MIN_CARDS);
  // 7枚しかない山札。手番の途中で尽きる経路を通す
  const small: TwoHeadedSet = { ...validSet(7), id: SMALL_SET_ID };
  for (const target of [large, small]) {
    registry.sets.set(target.id, target);
    registry.originals.set(target.id, target);
  }
  return {
    SETS: [large, small],
    findSet: (setId: string) => registry.sets.get(setId),
    summarize: (target: TwoHeadedSet) => ({ id: target.id, title: target.title, cardCount: target.cards.length }),
  };
});

const { twoHeadedModule } = await import("./module");
const { playersOf } = await import("./test-support/fixtures");

afterEach(() => {
  // 差し替えたセットを戻す。他のテストへ持ち越さない
  registry.sets = new Map(registry.originals);
});

const LEVELS: Record<number, Level[]> = {
  6: [1, 2, 3, 3, 4, 5],
  7: [1, 1, 2, 3, 4, 5, 5],
  8: [1, 1, 2, 3, 3, 4, 5, 5],
};

function rebuild(live: Live, playerId: string): TwoHeadedSecret | undefined {
  return twoHeadedModule.rebuildSecret({
    room: roomOf(live),
    publicState: live.publicState,
    gameSecret: live.gameSecret,
    playerId,
  });
}

let checks = 0;

/**
 * 全員について、作り直した値と最後に送った値を突き合わせる。
 *
 * playing 中は一致すること、finished では送らない（undefined）ことを確かめる。
 */
function verified(live: Live): Live {
  for (const player of live.players) {
    const rebuilt = rebuild(live, player.id);
    if (live.lifecycle === "finished") {
      expect(rebuilt, `finished の ${player.id}`).toBeUndefined();
    } else {
      expect(live.sent.get(player.id), `${live.stage} の ${player.id} へ送った値`).toBeDefined();
      expect(rebuilt, `${live.stage} turn${live.publicState.turnIndex} の ${player.id}`).toEqual(live.sent.get(player.id));
    }
  }
  checks += 1;
  return live;
}

function begin(count: number, options: { settings?: unknown; contentId?: string; seed?: number } = {}): Live {
  return verified(
    startLive(twoHeadedModule, playersOf(count, LEVELS[count]), {
      contentId: options.contentId ?? LARGE_SET_ID,
      settings: options.settings,
      seed: options.seed,
    }),
  );
}

/**
 * 手番ごとの進め方。turnIndex で切り替え、消費上限・送り・締切・未接続での飛ばしを混ぜる。
 *
 * 0: 正解と送りを交互に消費上限まで / 1: 送りを2回してから締切 / 2: 説明役の1人が切断して飛ばす / 3: 正解1回で締切
 */
function playTurn(live: Live): Live {
  const mode = live.publicState.turnIndex % 4;
  if (mode === 2) {
    const dropped = verified(setConnected(live, [explainersOf(live)[0] ?? ""], false));
    // 3人組は1人の切断では飛ばない。2人を落として飛ばす経路にする
    const team = explainersOf(dropped);
    const fully = team.length === 3 ? verified(setConnected(dropped, [team[1] ?? ""], false)) : dropped;
    const skipped = verified(expire(twoHeadedModule, fully));
    return verified(setConnected(skipped, skipped.players.map((player) => player.id), true));
  }
  let next = verified(startTurn(twoHeadedModule, live));
  if (mode === 0) {
    for (let index = 0; index < MAX_CARDS_PER_TURN && next.stage === STAGES.explaining; index += 1) {
      next = verified(index % 2 === 0 ? claim(twoHeadedModule, next) : pass(twoHeadedModule, next));
    }
    return next;
  }
  if (mode === 1) {
    next = verified(pass(twoHeadedModule, next));
    if (next.stage === STAGES.explaining) {
      next = verified(pass(twoHeadedModule, next));
    }
  } else {
    next = verified(claim(twoHeadedModule, next));
  }
  return next.stage === STAGES.explaining ? verified(expire(twoHeadedModule, next)) : next;
}

function playToEnd(live: Live): Live {
  let next = verified(readyAll(twoHeadedModule, live));
  while (next.stage !== STAGES.debrief) {
    next = playTurn(next);
  }
  return next;
}

describe("rebuildSecret（遷移が返した値との一致）", () => {
  it.each([
    [6, "1"],
    [6, "2"],
    [7, "1"],
    [7, "2"],
    [8, "1"],
    [8, "2"],
  ])("%i人・%s周で、消費上限・送り・締切・未接続での飛ばしを通して全員の値が一致する", (count, laps) => {
    checks = 0;
    const live = playToEnd(begin(count, { settings: { laps } }));
    expect(live.lifecycle).toBe("finished");
    expect(live.publicState.turns.some((turn) => turn.skipped)).toBe(live.publicState.turnOrder.length > 2);
    // 経路が途中で止まっていないこと
    expect(checks).toBeGreaterThan(live.publicState.turnOrder.length * 2);
  });

  it("briefing の締切で進んだ場合も一致する", () => {
    const live = verified(expire(twoHeadedModule, begin(6)));
    expect(live.stage).toBe(STAGES.handoff);
  });

  it("山札切れで終わる経路でも一致し、finished では全員に undefined を返す", () => {
    let live = verified(readyAll(twoHeadedModule, begin(8, { contentId: SMALL_SET_ID })));
    live = verified(startTurn(twoHeadedModule, live));
    while (live.stage !== STAGES.debrief) {
      live = verified(live.stage === STAGES.handoff ? startTurn(twoHeadedModule, live) : claim(twoHeadedModule, live));
    }
    expect(live.lifecycle).toBe("finished");
    expect(live.result?.usedCards).toHaveLength(7);
  });
});

describe("rebuildSecret（例外）", () => {
  it("お題セットが無い場合は例外を投げる", () => {
    const live = verified(readyAll(twoHeadedModule, begin(6)));
    registry.sets.delete(LARGE_SET_ID);
    expect(() => rebuild(live, "p1")).toThrow();
  });

  it("表示中のお題がセットに無い場合は例外を投げる", () => {
    const live = verified(readyAll(twoHeadedModule, begin(6)));
    const original = registry.originals.get(LARGE_SET_ID);
    if (original === undefined) {
      throw new Error("フィクスチャが無い");
    }
    registry.sets.set(LARGE_SET_ID, {
      ...original,
      cards: original.cards.filter((card) => card.id !== live.gameSecret.currentCardId),
    });
    const explainer = explainersOf(live)[0] ?? "";
    expect(() => rebuild(live, explainer)).toThrow();
  });

  it("playing の間に gameSecret が無い場合は例外を投げる", () => {
    const live = begin(6);
    expect(() =>
      twoHeadedModule.rebuildSecret({ room: roomOf(live), publicState: live.publicState, gameSecret: undefined, playerId: "p1" }),
    ).toThrow();
  });

  it("finished では gameSecret が無くても undefined を返す", () => {
    const live = { ...begin(6), lifecycle: "finished" as const };
    expect(
      twoHeadedModule.rebuildSecret({ room: roomOf(live), publicState: live.publicState, gameSecret: undefined, playerId: "p1" }),
    ).toBeUndefined();
  });
});
