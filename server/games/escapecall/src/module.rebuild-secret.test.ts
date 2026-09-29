// rebuildSecret が、遷移で最後に送った秘密と一致すること（ADR-0029、基本設計/13のテスト観点）。
//
// 共通コアは遷移が返した secrets を playerId ごとに上書きで保存する（server/core/src/room-do.ts の applyTransition）。
// ここでは同じ上書きの保存を手元で再現し、各遷移の直後に全員について作り直した値と突き合わせる。
// 作り直しへ切り替えた後に、再接続した人の断片が消える、別の錠の値に変わる退行を防ぐ。
import {
  ACTIONS,
  ERROR_CODES,
  LOCK_COUNT,
  STAGES,
  type EscapeCallPublic,
  type EscapeCallResult,
  type EscapeCallSecret,
} from "@beb/shared-escapecall";
import type { GameTransition, Player, Room } from "@beb/shared-core";
import { describe, expect, it, vi } from "vitest";
import type { EscapeCallGameSecret } from "./module";
import { playersOf } from "./test-support/fixtures";

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
const SEED = 1357;

type Transition = GameTransition<EscapeCallPublic, EscapeCallResult, EscapeCallGameSecret>;

/** 共通コアが持つ部屋の状態と、playerSecrets の上書き保存を再現した卓 */
interface Table {
  players: Player[];
  lifecycle: Room["lifecycle"];
  stage: string;
  publicState: EscapeCallPublic;
  gameSecret: EscapeCallGameSecret;
  /** playerId -> 最後に送った秘密 */
  stored: Map<string, unknown>;
}

function roomOf(table: Table): Room {
  return {
    code: "ABCD",
    lifecycle: table.lifecycle,
    players: table.players,
    gameId: "g",
    contentId: PACK_ID,
    stage: table.stage,
    gameState: table.publicState,
  };
}

function rebuild(table: Table, playerId: string): EscapeCallSecret | undefined {
  return escapeCallModule.rebuildSecret!({
    room: roomOf(table),
    publicState: table.publicState,
    gameSecret: table.gameSecret,
    playerId,
  });
}

/** 全員について、最後に送った値と作り直した値が一致することを確かめる */
function expectRebuildMatches(table: Table): void {
  for (const player of table.players) {
    expect(table.stored.has(player.id), `${player.id} に秘密が送られていない`).toBe(true);
    expect(rebuild(table, player.id), `${player.id} (stage=${table.stage})`).toEqual(table.stored.get(player.id));
  }
}

/** 遷移を共通コアと同じ規則で反映し、直後に突き合わせる */
function apply(table: Table, transition: Transition): Table {
  expect(transition.reject).toBeUndefined();
  const stored = new Map(table.stored);
  for (const [playerId, payload] of transition.secrets ?? []) {
    stored.set(playerId, payload);
  }
  const next: Table = {
    players: table.players,
    lifecycle: transition.result !== undefined ? "finished" : table.lifecycle,
    stage: transition.stage ?? table.stage,
    publicState: transition.publicState ?? table.publicState,
    gameSecret: transition.gameSecret ?? table.gameSecret,
    stored,
  };
  expectRebuildMatches(next);
  return next;
}

function start(players: Player[]): Table {
  const started = escapeCallModule.start({ players, contentId: PACK_ID, settings: {}, seed: SEED });
  const table: Table = {
    players,
    lifecycle: "playing",
    stage: started.stage,
    publicState: started.publicState,
    gameSecret: started.gameSecret!,
    stored: new Map(started.secrets),
  };
  expectRebuildMatches(table);
  return table;
}

function act(table: Table, playerId: string, action: string, payload: unknown = {}): Transition {
  return escapeCallModule.handleAction({
    room: roomOf(table),
    publicState: table.publicState,
    gameSecret: table.gameSecret,
    playerId,
    action,
    payload,
  });
}

function deadline(table: Table): Transition {
  return escapeCallModule.onDeadline({ room: roomOf(table), publicState: table.publicState, gameSecret: table.gameSecret });
}

function currentCode(table: Table): string {
  return table.gameSecret.locks[table.publicState.currentLockIndex]!.code;
}

/** 答えと桁数が同じで、答えと違う数字列 */
function wrongCode(code: string): string {
  return code
    .split("")
    .map((digit, index) => (index === 0 ? String((Number(digit) + 1) % 10) : digit))
    .join("");
}

function hostOf(table: Table): string {
  return table.players.find((player) => player.isHost)!.id;
}

/** 接続中の全員の ready で解錠へ進める。途中の ready でも突き合わせる */
function readyAll(table: Table): Table {
  let current = table;
  for (const player of current.players.filter((entry) => entry.connected)) {
    current = apply(current, act(current, player.id, ACTIONS.ready));
  }
  expect(current.stage).toBe(STAGES.solving);
  return current;
}

/** いま挑戦中の錠で、誤答とヒントを挟んでから正答する */
function solveCurrentLock(table: Table, submitter: string): Table {
  const lockIndex = table.publicState.currentLockIndex;
  let current = apply(table, act(table, submitter, ACTIONS.submit, { lockIndex, code: wrongCode(currentCode(table)) }));
  current = apply(current, act(current, hostOf(current), ACTIONS.hint, { lockIndex }));
  return apply(current, act(current, submitter, ACTIONS.submit, { lockIndex, code: currentCode(current) }));
}

// 対応人数の下限から上限まで。人数で断片の割り当てが変わる
const PARTY_SIZES = [[1, 5], [1, 3, 5], [1, 2, 4, 5]].map((levels) => ({ levels, count: levels.length }));

describe("rebuildSecret: 遷移で最後に送った秘密との一致", () => {
  it.each(PARTY_SIZES)("ready で進み、錠1〜3を開けて脱出するまで一致する（$count人）", ({ levels }) => {
    let table = readyAll(start(playersOf(levels)));
    for (let lockIndex = 0; lockIndex < LOCK_COUNT; lockIndex += 1) {
      const submitter = table.players[lockIndex % table.players.length]!.id;
      table = solveCurrentLock(table, submitter);
    }

    expect(table.lifecycle).toBe("finished");
    expect(table.stage).toBe(STAGES.debrief);
    expect(table.publicState.currentLockIndex).toBe(LOCK_COUNT);
    // 脱出後も最後の錠の断片を返す。currentLockIndex のまま作ると断片が空になる
    for (const player of table.players) {
      const secret = rebuild(table, player.id)!;
      expect(secret.lockIndex).toBe(LOCK_COUNT - 1);
      expect(secret.pieces.length).toBeGreaterThan(0);
    }
  });

  it.each(PARTY_SIZES)("締切で解錠へ進み、錠1を開けた後の時間切れまで一致する（$count人）", ({ levels }) => {
    let table = start(playersOf(levels));
    table = apply(table, deadline(table));
    expect(table.stage).toBe(STAGES.solving);
    table = solveCurrentLock(table, table.players[0]!.id);
    table = apply(table, deadline(table));

    expect(table.lifecycle).toBe("finished");
    expect(table.stage).toBe(STAGES.debrief);
    expect(table.publicState.currentLockIndex).toBe(1);
  });

  it("錠を1つも開けずに時間切れになっても一致する", () => {
    let table = readyAll(start(playersOf([2, 4])));
    table = apply(table, deadline(table));
    expect(table.publicState.currentLockIndex).toBe(0);
    expect(table.lifecycle).toBe("finished");
  });

  it("錠3の挑戦中に時間切れになっても一致する", () => {
    let table = readyAll(start(playersOf([1, 3, 5])));
    table = solveCurrentLock(table, "p1");
    table = solveCurrentLock(table, "p2");
    table = apply(table, deadline(table));
    expect(table.publicState.currentLockIndex).toBe(LOCK_COUNT - 1);
    expect(table.lifecycle).toBe("finished");
  });

  it("切断中の人を待たずに解錠へ進んだ後、その人が再接続しても一致する", () => {
    const players = playersOf([1, 2, 4, 5]).map((player) =>
      player.id === "p4" ? { ...player, connected: false } : player,
    );
    let table = readyAll(start(players));
    // p4 は ready していないが、解錠へ入るときに全員分の断片が送られている
    expect(table.publicState.readyPlayerIds).not.toContain("p4");
    const reconnected = rebuild(table, "p4")!;
    expect(reconnected.pieces.length).toBeGreaterThan(0);
    table = solveCurrentLock(table, "p1");
    expect(rebuild(table, "p4")).toEqual(table.stored.get("p4"));
  });

  it("拒否された操作の後も一致したままである", () => {
    let table = readyAll(start(playersOf([1, 3, 5])));
    const lockIndex = table.publicState.currentLockIndex;
    const wrong = wrongCode(currentCode(table));
    table = apply(table, act(table, "p1", ACTIONS.submit, { lockIndex, code: wrong }));
    // 同じ誤答と遅着の提出は拒否され、秘密も状態も変わらない
    expect(act(table, "p2", ACTIONS.submit, { lockIndex, code: wrong }).reject?.code).toBe(ERROR_CODES.alreadyAttempted);
    table = apply(table, act(table, "p2", ACTIONS.submit, { lockIndex, code: currentCode(table) }));
    expect(act(table, "p3", ACTIONS.submit, { lockIndex, code: "000" }).reject?.code).toBe(ERROR_CODES.staleLock);
    expectRebuildMatches(table);
  });
});

describe("rebuildSecret: 想定外の状態では例外を投げる", () => {
  // 例外なら共通コアが保存済みの値を送る。誤った値を黙って返さないことを固定する
  function solvingTable(): Table {
    return readyAll(start(playersOf([1, 3, 5])));
  }

  it("gameSecret が無い", () => {
    const table = solvingTable();
    expect(() =>
      escapeCallModule.rebuildSecret!({
        room: roomOf(table),
        publicState: table.publicState,
        gameSecret: undefined,
        playerId: "p1",
      }),
    ).toThrow();
  });

  it("挑戦中の錠が gameSecret に無い", () => {
    const table = solvingTable();
    expect(() => rebuild({ ...table, gameSecret: { locks: [] } }, "p1")).toThrow();
  });

  it("参加者でない playerId", () => {
    expect(() => rebuild(solvingTable(), "stranger")).toThrow();
  });

  it("未知のステージ", () => {
    expect(() => rebuild({ ...solvingTable(), stage: "unknown" }, "p1")).toThrow();
  });
});
