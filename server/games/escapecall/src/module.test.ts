// GameModuleの振る舞い。Durable Objectなしで全項目を確かめる（基本設計/13のテスト観点）
import {
  ACTIONS,
  ERROR_CODES,
  ESCAPE_SECONDS,
  LOCK_SPECS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  type EscapeCallPublic,
  type EscapeCallResult,
  type EscapeCallSecret,
} from "@beb/shared-escapecall";
import { ACTION_MAX_CHARS, type Player, type Room } from "@beb/shared-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EscapeCallGameSecret } from "./module";
import { playersOf, validPack } from "./test-support/fixtures";

// 本番のcontent/を読ませない。テストは固定のパックだけを見る
vi.mock("./packs", async () => {
  const { validPack: pack } = await import("./test-support/fixtures");
  const { summarize } = await vi.importActual<typeof import("./packs")>("./packs");
  const packs = [pack()];
  return {
    PACKS: packs,
    findPack: (packId: string) => packs.find((entry) => entry.id === packId),
    summarize,
  };
});

const { escapeCallModule } = await import("./module");

const PACK_ID = "fixture";
const SEED = 2468;

let players: Player[];

beforeEach(() => {
  players = playersOf([1, 3, 5]);
});

function startGame(input: { players?: Player[]; settings?: unknown; seed?: number } = {}) {
  return escapeCallModule.start({
    players: input.players ?? players,
    contentId: PACK_ID,
    settings: input.settings ?? {},
    seed: input.seed ?? SEED,
  });
}

function roomOf(publicState: EscapeCallPublic, stage: string, base: Player[] = players): Room {
  return {
    code: "ABCD",
    lifecycle: "playing",
    players: base,
    gameId: "g",
    contentId: PACK_ID,
    stage,
    gameState: publicState,
  };
}

interface Table {
  publicState: EscapeCallPublic;
  gameSecret: EscapeCallGameSecret;
  stage: string;
  secrets: Map<string, unknown>;
  result?: EscapeCallResult;
}

/** 開始して全員の ready で solving まで進める */
function solvingTable(base: Player[] = players, settings: unknown = {}): Table {
  const started = startGame({ players: base, settings });
  let state: Table = {
    publicState: started.publicState,
    gameSecret: started.gameSecret!,
    stage: started.stage,
    secrets: started.secrets,
  };
  for (const player of base) {
    const transition = escapeCallModule.handleAction({
      room: roomOf(state.publicState, state.stage, base),
      publicState: state.publicState,
      gameSecret: state.gameSecret,
      playerId: player.id,
      action: ACTIONS.ready,
      payload: {},
    });
    state = {
      publicState: transition.publicState ?? state.publicState,
      gameSecret: transition.gameSecret ?? state.gameSecret,
      stage: transition.stage ?? state.stage,
      secrets: transition.secrets ?? state.secrets,
    };
  }
  return state;
}

function act(state: Table, playerId: string, action: string, payload: unknown = {}, base: Player[] = players) {
  return escapeCallModule.handleAction({
    room: roomOf(state.publicState, state.stage, base),
    publicState: state.publicState,
    gameSecret: state.gameSecret,
    playerId,
    action,
    payload,
  });
}

function apply(state: Table, transition: ReturnType<typeof act>): Table {
  return {
    publicState: transition.publicState ?? state.publicState,
    gameSecret: transition.gameSecret ?? state.gameSecret,
    stage: transition.stage ?? state.stage,
    secrets: transition.secrets ?? state.secrets,
    result: transition.result ?? state.result,
  };
}

function currentCode(state: Table): string {
  return state.gameSecret.locks[state.publicState.currentLockIndex]!.code;
}

/** 答えと桁数が同じで、答えと違う数字列 */
function wrongCode(code: string, offset = 1): string {
  return code
    .split("")
    .map((digit, index) => (index === 0 ? String((Number(digit) + offset) % 10) : digit))
    .join("");
}

describe("start", () => {
  it("同じseedと参加者から同じ錠と同じ割り当てが得られる（決定性）", () => {
    expect(startGame().gameSecret).toEqual(startGame().gameSecret);
  });

  it("briefing で始まり、締切は90秒、秘密の断片は空である", () => {
    const started = startGame();
    expect(started.stage).toBe(STAGES.briefing);
    expect(started.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.briefing);
    for (const secret of started.secrets.values()) {
      expect((secret as EscapeCallSecret).pieces).toEqual([]);
    }
  });

  it("錠は3つで、桁数は錠の定義どおりである", () => {
    const { publicState } = startGame();
    expect(publicState.locks.map((lock) => lock.codeLength)).toEqual(LOCK_SPECS.map((spec) => spec.codeLength));
    expect(publicState.locks.every((lock) => !lock.opened)).toBe(true);
  });

  // 不変条件2。state は全員へブロードキャストされる
  it("公開状態に答え・並び・対応表・規則の文が現れない", () => {
    const table = solvingTable();
    const text = JSON.stringify(table.publicState);
    for (const lock of table.gameSecret.locks) {
      expect(text).not.toContain(`"${lock.code}"`);
      for (const symbol of lock.order) {
        expect(text).not.toContain(symbol);
      }
      for (const rule of lock.rules) {
        const phrase = validPack().rulePhrases[rule.ruleId];
        expect(text).not.toContain(phrase.standard.split("{")[0]!.trim());
      }
    }
  });

  it("カタログに規則の言い回しが含まれない", () => {
    const listed = JSON.stringify(escapeCallModule.listContents());
    expect(listed).not.toContain("Skip");
    expect(escapeCallModule.listContents()).toEqual([{ id: PACK_ID, title: "Fixture" }]);
  });

  it("規則を持つ人のレベル1〜2には easy と日本語の補足、3〜5には standard だけが配られる", () => {
    for (const levels of [
      [1, 1],
      [4, 1],
    ]) {
      const base = playersOf(levels);
      const { gameSecret } = startGame({ players: base });
      const holderRules = Object.values(gameSecret!.locks[1]!.assignments)
        .flat()
        .find((piece) => piece.kind === "rule");
      expect(holderRules?.kind).toBe("rule");
      if (holderRules?.kind === "rule") {
        const rule = holderRules.rules[0]!;
        const phrase = validPack().rulePhrases[rule.ruleId];
        const top = Math.max(...levels);
        if (top <= 2) {
          expect(rule.textJa).toBeDefined();
          expect(rule.textEn.startsWith(phrase.easy.split("{")[0]!)).toBe(true);
        } else {
          expect(rule.textJa).toBeUndefined();
          expect(rule.textEn.startsWith(phrase.standard.split("{")[0]!)).toBe(true);
        }
        expect(rule.textEn).not.toMatch(/\{(color|shape)\}/);
      }
    }
  });
});

describe("ready と solving への遷移", () => {
  it("接続中の全員が揃うと solving へ進み、締切は escapeSeconds になり、全員へ錠1の断片が配られる", () => {
    const table = solvingTable(players, { escapeSeconds: 420 });
    expect(table.stage).toBe(STAGES.solving);
    for (const player of players) {
      const secret = table.secrets.get(player.id) as EscapeCallSecret;
      expect(secret.lockIndex).toBe(0);
      expect(secret.pieces.length).toBeGreaterThan(0);
    }
    expect(table.publicState.holders).toHaveLength(players.length);
  });

  it("solving へ入るときに escapeSeconds を締切にする", () => {
    const started = startGame({ settings: { escapeSeconds: 420 } });
    let state: Table = { publicState: started.publicState, gameSecret: started.gameSecret!, stage: started.stage, secrets: started.secrets };
    let last;
    for (const player of players) {
      last = act(state, player.id, ACTIONS.ready);
      state = apply(state, last);
    }
    expect(last?.deadlineSeconds).toBe(420);
  });

  it("briefing の締切で solving へ進み、錠1の断片が配られる", () => {
    const started = startGame();
    const transition = escapeCallModule.onDeadline({
      room: roomOf(started.publicState, STAGES.briefing),
      publicState: started.publicState,
      gameSecret: started.gameSecret,
    });
    expect(transition.stage).toBe(STAGES.solving);
    expect(transition.secrets?.size).toBe(players.length);
  });
});

describe("submit", () => {
  it("桁数違い・数字以外・文字列以外は invalid_code で拒否される", () => {
    const table = solvingTable();
    for (const payload of [{ code: "123" }, { code: "12a4" }, { code: 1234 }, {}]) {
      expect(act(table, "p1", ACTIONS.submit, payload).reject?.code).toBe(ERROR_CODES.invalidCode);
    }
  });

  it("誤答は attempts に1行増えるだけで、ステージも締切も変わらない", () => {
    const table = solvingTable();
    const transition = act(table, "p1", ACTIONS.submit, { code: wrongCode(currentCode(table)) });
    expect(transition.publicState?.attempts).toHaveLength(1);
    expect(transition.publicState?.attempts[0]?.accepted).toBe(false);
    expect(transition.stage).toBeUndefined();
    expect(transition.deadlineSeconds).toBeUndefined();
  });

  it("同じ錠への同じ誤答は already_attempted で拒否され、状態が変わらない", () => {
    let table = solvingTable();
    const wrong = wrongCode(currentCode(table));
    table = apply(table, act(table, "p1", ACTIONS.submit, { code: wrong }));
    const again = act(table, "p2", ACTIONS.submit, { code: wrong });
    expect(again.reject?.code).toBe(ERROR_CODES.alreadyAttempted);
    expect(again.publicState).toBeUndefined();
  });

  it("正答で錠が開き、次の錠へ進み、締切を置き直さず、全員へ次の錠の断片の全量が送られる", () => {
    const table = solvingTable();
    const transition = act(table, "p2", ACTIONS.submit, { code: currentCode(table) });
    expect(transition.publicState?.locks[0]?.opened).toBe(true);
    expect(transition.publicState?.currentLockIndex).toBe(1);
    expect(transition.deadlineSeconds).toBeUndefined();
    for (const player of players) {
      const secret = transition.secrets?.get(player.id) as EscapeCallSecret;
      expect(secret.lockIndex).toBe(1);
      expect(secret.pieces).toEqual(table.gameSecret.locks[1]!.assignments[player.id]);
    }
  });

  it("開いた錠の答えを次の錠へ提出しても開かない", () => {
    let table = solvingTable();
    const first = currentCode(table);
    table = apply(table, act(table, "p1", ACTIONS.submit, { code: first }));
    if (first !== currentCode(table)) {
      const transition = act(table, "p1", ACTIONS.submit, { code: first });
      expect(transition.publicState?.locks[1]?.opened).toBe(false);
    }
  });

  it("3つ目の錠の正答で result が返り、outcome が escaped、ステージが debrief になる", () => {
    let table = solvingTable();
    let transition;
    for (let index = 0; index < 3; index += 1) {
      transition = act(table, "p1", ACTIONS.submit, { code: currentCode(table) });
      table = apply(table, transition);
    }
    expect(transition?.stage).toBe(STAGES.debrief);
    expect(transition?.result?.outcome).toBe("escaped");
    expect(transition?.result?.rank).toBe("S");
    expect(transition?.result?.openedCount).toBe(3);
  });

  it("solving 以外では invalid_stage で拒否される", () => {
    const started = startGame();
    const transition = escapeCallModule.handleAction({
      room: roomOf(started.publicState, STAGES.briefing),
      publicState: started.publicState,
      gameSecret: started.gameSecret,
      playerId: "p1",
      action: ACTIONS.submit,
      payload: { code: "1234" },
    });
    expect(transition.reject?.code).toBe(ERROR_CODES.invalidStage);
  });

  it("ペイロードが ACTION_MAX_CHARS 未満に収まる", () => {
    expect(JSON.stringify({ code: "99999" }).length).toBeLessThan(ACTION_MAX_CHARS);
  });
});

describe("hint", () => {
  it("ホスト以外は not_host で拒否される", () => {
    const table = solvingTable();
    expect(act(table, "p2", ACTIONS.hint).reject?.code).toBe(ERROR_CODES.notHost);
  });

  it("左から1桁ずつ開示され、codeLength - 1 桁を超えると no_more_hints で拒否される", () => {
    let table = solvingTable();
    const code = currentCode(table);
    for (let index = 0; index < code.length - 1; index += 1) {
      const transition = act(table, "p1", ACTIONS.hint);
      table = apply(table, transition);
      expect(table.publicState.hints[index]).toEqual({ lockIndex: 0, position: index, digit: code[index] });
    }
    expect(act(table, "p1", ACTIONS.hint).reject?.code).toBe(ERROR_CODES.noMoreHints);
  });
});

describe("結果", () => {
  it("solving の締切で result が返り、outcome が time_up、開かなかった錠の答えと断片も含まれる", () => {
    const table = solvingTable();
    const transition = escapeCallModule.onDeadline({
      room: roomOf(table.publicState, STAGES.solving),
      publicState: table.publicState,
      gameSecret: table.gameSecret,
    });
    expect(transition.stage).toBe(STAGES.debrief);
    expect(transition.result?.outcome).toBe("time_up");
    expect(transition.result?.rank).toBe("D");
    expect(transition.result?.locks).toHaveLength(3);
    transition.result?.locks.forEach((lock, index) => {
      expect(lock.code).toBe(table.gameSecret.locks[index]!.code);
      expect(lock.order).toEqual(table.gameSecret.locks[index]!.order);
    });
  });

  it("誤答とヒントの数がランクに反映される", () => {
    let table = solvingTable();
    table = apply(table, act(table, "p1", ACTIONS.hint));
    for (let offset = 1; offset <= 3; offset += 1) {
      table = apply(table, act(table, "p1", ACTIONS.submit, { code: wrongCode(currentCode(table), offset) }));
    }
    let transition;
    for (let index = 0; index < 3; index += 1) {
      transition = act(table, "p1", ACTIONS.submit, { code: currentCode(table) });
      table = apply(table, transition);
    }
    expect(transition?.result?.hintCount).toBe(1);
    expect(transition?.result?.wrongCount).toBe(3);
    expect(transition?.result?.rank).toBe("A");
  });

  it("rules[].textEn が、その錠で規則を持った人に配った英文と一致する", () => {
    const table = solvingTable();
    const transition = escapeCallModule.onDeadline({
      room: roomOf(table.publicState, STAGES.solving),
      publicState: table.publicState,
      gameSecret: table.gameSecret,
    });
    const delivered = Object.values(table.gameSecret.locks[2]!.assignments)
      .flat()
      .find((piece) => piece.kind === "rule");
    if (delivered?.kind === "rule") {
      expect(transition.result?.locks[2]?.rules.map((rule) => rule.textEn)).toEqual(
        delivered.rules.map((rule) => rule.textEn),
      );
    }
  });
});

describe("設定と人数", () => {
  it("記述子の min / max と validateSettings の受理範囲が一致する", () => {
    const field = escapeCallModule.settingsFields.find((entry) => entry.key === "escapeSeconds");
    expect(field).toMatchObject({ min: ESCAPE_SECONDS.min, max: ESCAPE_SECONDS.max, default: ESCAPE_SECONDS.default });
    expect(escapeCallModule.validateSettings({ escapeSeconds: ESCAPE_SECONDS.min }).valid).toBe(true);
    expect(escapeCallModule.validateSettings({ escapeSeconds: ESCAPE_SECONDS.max }).valid).toBe(true);
    expect(escapeCallModule.validateSettings({ escapeSeconds: ESCAPE_SECONDS.min - 1 }).valid).toBe(false);
    expect(escapeCallModule.validateSettings({ escapeSeconds: ESCAPE_SECONDS.max + 1 }).valid).toBe(false);
    expect(escapeCallModule.validateSettings({ escapeSeconds: 450.5 }).valid).toBe(false);
    expect(escapeCallModule.validateSettings({ escapeSeconds: "600" }).valid).toBe(false);
  });

  it("対応人数は2〜4人で、2人・3人・4人で開始できる", () => {
    expect(escapeCallModule.playerCount).toEqual([2, 4]);
    for (const levels of [
      [2, 3],
      [1, 2, 3],
      [1, 2, 4, 5],
    ]) {
      const table = solvingTable(playersOf(levels));
      expect(table.stage).toBe(STAGES.solving);
      for (const pieces of Object.values(table.gameSecret.locks[0]!.assignments)) {
        expect(pieces.length).toBeGreaterThan(0);
      }
    }
  });
});
