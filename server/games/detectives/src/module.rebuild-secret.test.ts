// rebuildSecret の突き合わせ（ADR-0029、基本設計/08）。
//
// 共通コアは遷移が返した secrets をプレイヤーごとに上書きで保存し、再接続ではその代わりに
// rebuildSecret の戻り値を送る。両者が食い違うと、再接続した人の手元の証言カードや役割が
// 消える・変わる。そのため共通コアと同じ保存を再現し、各遷移の直後に全員分を突き合わせる。
import { describe, expect, it } from "vitest";
import { fallbackPlayerIconId, type GameTransition, type Level, type Player, type Room } from "@beb/shared-core";
import {
  RANDOM_CASE_ID,
  STAGES,
  type Case,
  type DetectivesPublic,
  type DetectivesResult,
  type DetectivesSecret,
} from "@beb/shared-detectives";
import { CASES } from "./cases";
import { derive5p } from "./derive-5p";
import { detectivesModule, type DetectivesGameSecret } from "./module";

const CASE_ID = "cafe_theft_v1";

type Transition = GameTransition<DetectivesPublic, DetectivesResult, DetectivesGameSecret>;

/** 共通コアが持つ状態のうち、再接続の秘密情報に関わる分 */
interface Sim {
  room: Room;
  publicState: DetectivesPublic;
  gameSecret: DetectivesGameSecret | undefined;
  /** 遷移が返した secrets をプレイヤーごとに上書きで溜めたもの（共通コアの playerSecrets と同じ） */
  stored: Map<string, DetectivesSecret>;
}

function makePlayers(levels: Level[]): Player[] {
  return levels.map((level, index) => ({
    id: `p${index + 1}`,
    name: `Player${index + 1}`,
    level,
    icon: fallbackPlayerIconId(`p${index + 1}`),
    connected: true,
    isHost: index === 0,
  }));
}

function startSim(levels: Level[], seed: number, contentId = CASE_ID): Sim {
  const players = makePlayers(levels);
  const started = detectivesModule.start({ players, contentId, settings: undefined, seed });
  return {
    room: { code: "AB12", lifecycle: "playing", players, gameId: "g", contentId, stage: started.stage },
    publicState: started.publicState,
    gameSecret: started.gameSecret,
    stored: new Map(started.secrets),
  };
}

/** 共通コアと同じ規則で遷移を反映する（基本設計/01） */
function apply(sim: Sim, transition: Transition): Sim {
  if (transition.reject !== undefined) {
    return sim;
  }
  const stored = new Map(sim.stored);
  for (const [playerId, secret] of transition.secrets ?? []) {
    stored.set(playerId, secret as DetectivesSecret);
  }
  return {
    room: {
      ...sim.room,
      stage: transition.stage ?? sim.room.stage,
      lifecycle: transition.result !== undefined ? "finished" : sim.room.lifecycle,
    },
    publicState: transition.publicState ?? sim.publicState,
    gameSecret: transition.gameSecret ?? sim.gameSecret,
    stored,
  };
}

function act(sim: Sim, playerId: string, action: string, payload: unknown = {}): Sim {
  const next = apply(
    sim,
    detectivesModule.handleAction({
      room: sim.room,
      publicState: sim.publicState,
      gameSecret: sim.gameSecret,
      playerId,
      action,
      payload,
    }),
  );
  expectRebuildMatches(next);
  return next;
}

function deadline(sim: Sim): Sim {
  const next = apply(
    sim,
    detectivesModule.onDeadline({ room: sim.room, publicState: sim.publicState, gameSecret: sim.gameSecret }),
  );
  expectRebuildMatches(next);
  return next;
}

function rebuild(sim: Sim, playerId: string): DetectivesSecret | undefined {
  return detectivesModule.rebuildSecret?.({
    room: sim.room,
    publicState: sim.publicState,
    gameSecret: sim.gameSecret,
    playerId,
  });
}

/** 全員について、保存済みの値と作り直した値が一致することを確かめる */
function expectRebuildMatches(sim: Sim): void {
  expect(sim.stored.size).toBe(sim.room.players.length);
  for (const player of sim.room.players) {
    const stored = sim.stored.get(player.id);
    expect(stored).toBeDefined();
    expect(rebuild(sim, player.id)).toEqual(stored);
  }
}

function culpritOf(sim: Sim): string {
  return (sim.gameSecret as DetectivesGameSecret).culpritPlayerId;
}

function voteTargetOf(sim: Sim, voterId: string): string {
  // 犯人以外は犯人へ、犯人は自分以外の先頭へ入れる
  const culprit = culpritOf(sim);
  if (voterId !== culprit) {
    return culprit;
  }
  return sim.room.players.find((player) => player.id !== voterId)!.id;
}

function playerIds(sim: Sim): string[] {
  return sim.room.players.map((player) => player.id);
}

/** 全員の操作で start から開示まで進める。途中で拒否される操作も混ぜる */
function playByActions(sim: Sim): Sim {
  expectRebuildMatches(sim);
  let state = sim;
  for (const playerId of playerIds(state)) {
    state = act(state, playerId, "ready");
  }
  expect(state.room.stage).toBe(STAGES.investigation);

  // ホスト以外の切り上げは拒否される
  state = act(state, "p2", "endInvestigation");
  expect(state.room.stage).toBe(STAGES.investigation);
  state = act(state, "p1", "endInvestigation");
  expect(state.room.stage).toBe(STAGES.voting);

  for (const playerId of playerIds(state)) {
    // 自分への投票は拒否される
    state = act(state, playerId, "vote", { targetPlayerId: playerId });
    state = act(state, playerId, "vote", { targetPlayerId: voteTargetOf(state, playerId) });
  }
  expect(state.room.stage).toBe(STAGES.reveal);
  expect(state.room.lifecycle).toBe("finished");

  // 開示後の操作と締切は何も変えない
  state = act(state, "p1", "ready");
  state = deadline(state);
  return state;
}

/** 締切だけで start から開示まで進める */
function playByDeadlines(sim: Sim, voters: string[]): Sim {
  expectRebuildMatches(sim);
  let state = act(sim, "p1", "ready");
  state = deadline(state);
  expect(state.room.stage).toBe(STAGES.investigation);
  state = deadline(state);
  expect(state.room.stage).toBe(STAGES.voting);
  for (const playerId of voters) {
    state = act(state, playerId, "vote", { targetPlayerId: voteTargetOf(state, playerId) });
  }
  state = deadline(state);
  expect(state.room.stage).toBe(STAGES.reveal);
  expect(state.room.lifecycle).toBe("finished");
  return state;
}

const SIX: Level[] = [5, 4, 3, 2, 1, 1];
const FIVE: Level[] = [1, 2, 3, 4, 5];

describe("rebuildSecret: 遷移が送った値との一致", () => {
  it("6人版を全員の操作で開示まで進めても、全員の作り直しが保存済みの値と一致する", () => {
    const state = playByActions(startSim(SIX, 12345));
    expect(state.gameSecret?.playerCountVariant).toBe("6p");
  });

  it("5人版を締切で開示まで進めても、全員の作り直しが保存済みの値と一致する", () => {
    const state = playByDeadlines(startSim(FIVE, 777), ["p2", "p3"]);
    expect(state.gameSecret?.playerCountVariant).toBe("5p");
  });

  it("1票も入らずに締め切っても一致する", () => {
    playByDeadlines(startSim(SIX, 99), []);
  });

  it("切断者がいて接続中の全員で遷移しても一致する", () => {
    let state = startSim(SIX, 4242);
    state = {
      ...state,
      room: {
        ...state.room,
        players: state.room.players.map((player) => (player.id === "p6" ? { ...player, connected: false } : player)),
      },
    };
    expectRebuildMatches(state);
    for (const playerId of ["p1", "p2", "p3", "p4", "p5"]) {
      state = act(state, playerId, "ready");
    }
    expect(state.room.stage).toBe(STAGES.investigation);
    state = deadline(state);
    for (const playerId of ["p1", "p2", "p3", "p4", "p5"]) {
      state = act(state, playerId, "vote", { targetPlayerId: voteTargetOf(state, playerId) });
    }
    expect(state.room.lifecycle).toBe("finished");
  });

  it("おまかせで選ばれた事件でも一致する", () => {
    const picked = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const state = playByActions(startSim(SIX, seed, RANDOM_CASE_ID));
      picked.add(state.publicState.caseId);
    }
    // 1件の事件だけを通していないことを確かめる
    if (CASES.length >= 2) {
      expect(picked.size).toBeGreaterThan(1);
    }
  });

  it("収録済みの全事件で、5人版と6人版の全犯人バリアントについて一致する", () => {
    for (const base of CASES) {
      for (const [levels, version] of [
        [SIX, base],
        [FIVE, derive5p(base)],
      ] as [Level[], Case][]) {
        const culprits = new Set<string>();
        for (let seed = 1; seed <= 300 && culprits.size < version.variants.length; seed += 1) {
          const state = startSim(levels, seed, base.id);
          const culprit = state.gameSecret!.culpritCharacterId;
          if (culprits.has(culprit)) {
            continue;
          }
          culprits.add(culprit);
          playByDeadlines(state, playerIds(state).slice(0, 2));
        }
        // 抽選に偏りがあっても、すべてのバリアントを1回は通す
        expect([...culprits].sort()).toEqual(version.variants.map((variant) => variant.culprit).sort());
      }
    }
  });
});

describe("rebuildSecret: 作り直せない場合", () => {
  function started(): Sim {
    return startSim(SIX, 12345);
  }

  function rebuildWith(sim: Sim, overrides: Partial<Sim>, playerId = "p1"): DetectivesSecret | undefined {
    return rebuild({ ...sim, ...overrides }, playerId);
  }

  /** 事件データを差し替えて fn を実行し、終わったら元へ戻す */
  function withCase(caseId: string, mutate: (target: Case) => void, fn: () => void): void {
    const index = CASES.findIndex((entry) => entry.id === caseId);
    const original = CASES[index]!;
    const modified = JSON.parse(JSON.stringify(original)) as Case;
    mutate(modified);
    CASES[index] = modified;
    try {
      fn();
    } finally {
      CASES[index] = original;
    }
  }

  it("秘密状態が無ければ例外を投げる", () => {
    expect(() => rebuildWith(started(), { gameSecret: undefined })).toThrow();
  });

  it("事件が登録されていなければ例外を投げる", () => {
    const sim = started();
    expect(() => rebuildWith(sim, { gameSecret: { ...sim.gameSecret!, caseId: "missing_case" } })).toThrow();
  });

  it("犯人バリアントが事件データに無ければ例外を投げる", () => {
    const sim = started();
    expect(() => rebuildWith(sim, { gameSecret: { ...sim.gameSecret!, culpritCharacterId: "nobody" } })).toThrow();
  });

  it("配役されたキャラクターが事件データに無ければ、空の手札を返さず例外を投げる", () => {
    const sim = started();
    const cast = sim.publicState.cast.map((entry) =>
      entry.playerId === "p1" ? { ...entry, characterId: "renamed_character" } : entry,
    );
    expect(() => rebuildWith(sim, { publicState: { ...sim.publicState, cast } })).toThrow();
  });

  it("配役されたキャラクターの証言が事件データに無ければ例外を投げる", () => {
    const sim = started();
    const characterId = sim.publicState.cast.find((entry) => entry.playerId === "p1")!.characterId;
    const other = sim.publicState.cast.find((entry) => entry.playerId === "p2")!.characterId;
    withCase(
      CASE_ID,
      (target) => {
        for (const fact of target.facts) {
          if (fact.owner === characterId) {
            fact.owner = other;
          }
        }
      },
      () => expect(() => rebuild(sim, "p1")).toThrow(),
    );
  });

  it("本人のレベルの英文が事件データに無ければ、undefinedの英文を返さず例外を投げる", () => {
    const sim = started();
    const entry = sim.publicState.cast.find((member) => member.playerId !== culpritOf(sim))!;
    const level = sim.room.players.find((player) => player.id === entry.playerId)!.level;
    withCase(
      CASE_ID,
      (target) => {
        const fact = target.facts.find((candidate) => candidate.owner === entry.characterId)!;
        delete (fact.text as Partial<Record<string, string>>)[`${level}`];
      },
      () => expect(() => rebuild(sim, entry.playerId)).toThrow(),
    );
  });

  it("犯人の嘘の英文が事件データに無ければ例外を投げる", () => {
    const sim = started();
    const culprit = culpritOf(sim);
    const level = sim.room.players.find((player) => player.id === culprit)!.level;
    withCase(
      CASE_ID,
      (target) => {
        const variant = target.variants.find((entry) => entry.culprit === sim.gameSecret!.culpritCharacterId)!;
        delete (variant.lie.text as Partial<Record<string, string>>)[`${level}`];
      },
      () => expect(() => rebuild(sim, culprit)).toThrow(),
    );
  });

  it("嘘の差し替え先が犯人の手札に無ければ、嘘の無い手札を返さず例外を投げる", () => {
    const sim = started();
    const culprit = culpritOf(sim);
    withCase(
      CASE_ID,
      (target) => {
        const variant = target.variants.find((entry) => entry.culprit === sim.gameSecret!.culpritCharacterId)!;
        variant.lie.replaces = "missing_fact";
      },
      () => expect(() => rebuild(sim, culprit)).toThrow(),
    );
  });

  it("本人が部屋にいなければ、レベルを決められないため例外を投げる", () => {
    const sim = started();
    const players = sim.room.players.filter((player) => player.id !== "p1");
    expect(() => rebuildWith(sim, { room: { ...sim.room, players } })).toThrow();
  });

  it("他のプレイヤーが部屋にいなくても、本人の分は作り直せる", () => {
    const sim = started();
    const players = sim.room.players.filter((player) => player.id !== "p2");
    expect(rebuildWith(sim, { room: { ...sim.room, players } })).toEqual(sim.stored.get("p1"));
  });

  it("配役されていない人にはundefinedを返す（startでも送っていない）", () => {
    expect(rebuild(started(), "ghost")).toBeUndefined();
  });
});
