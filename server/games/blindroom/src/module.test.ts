// GameModuleの振る舞い。Durable Objectなしで全項目を確かめる（基本設計/12のテスト観点）
import {
  ACTIONS,
  BOARD_SIZES,
  BUILDING_SECONDS,
  DEFAULT_BOARD_SIZE_ID,
  ERROR_CODES,
  PLACE_COUNT,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  cellCountOf,
  emptyBoard,
  hasDuplicateItem,
  hintCountFor,
  placedCount,
  placedItemIds,
  pointsOf,
  type BlindRoomPublic,
  type BlindRoomSecret,
  type Board,
  type DescriberSecret,
  type ListenerSecret,
} from "@beb/shared-blindroom";
import { ACTION_MAX_CHARS, type Player, type Room } from "@beb/shared-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlindRoomGameSecret } from "./module";
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

const { blindRoomModule } = await import("./module");

const PACK_ID = "fixture_pack";
const SEED = 4242;
/** 既定の広さ（標準 4×3）のマス数 */
const CELL_COUNT = cellCountOf(DEFAULT_BOARD_SIZE_ID);

let players: Player[];

beforeEach(() => {
  players = playersOf([1, 2, 3, 4, 5, 5]);
});

function startGame(input: { players?: Player[]; settings?: unknown; seed?: number } = {}) {
  return blindRoomModule.start({
    players: input.players ?? players,
    contentId: PACK_ID,
    settings: input.settings ?? {},
    seed: input.seed ?? SEED,
  });
}

function roomOf(
  publicState: BlindRoomPublic,
  stage: string,
  overrides: { players?: Player[]; disconnected?: string[] } = {},
): Room {
  const base = overrides.players ?? players;
  return {
    code: "ABCD",
    lifecycle: "playing",
    players: base.map((player) =>
      overrides.disconnected?.includes(player.id) ? { ...player, connected: false } : player,
    ),
    gameId: "g",
    contentId: PACK_ID,
    stage,
    gameState: publicState,
  };
}

interface Progress {
  publicState: BlindRoomPublic;
  gameSecret: BlindRoomGameSecret;
  stage: string;
  deadlineSeconds?: number;
  result?: { scores: { playerId: string; points: number }[]; rounds: unknown[]; items: unknown[] };
  reject?: { code: string };
  secrets?: Map<string, unknown>;
}

/** 1手を進める。返り値のpublicStateとgameSecretは未更新なら現状を維持する */
function act(
  progress: Progress,
  playerId: string,
  action: string,
  payload: unknown,
  overrides: { disconnected?: string[]; players?: Player[] } = {},
): Progress {
  const transition = blindRoomModule.handleAction({
    room: roomOf(progress.publicState, progress.stage, overrides),
    publicState: progress.publicState,
    gameSecret: progress.gameSecret,
    playerId,
    action,
    payload,
  });
  return {
    publicState: transition.publicState ?? progress.publicState,
    gameSecret: transition.gameSecret ?? progress.gameSecret,
    stage: transition.stage ?? progress.stage,
    deadlineSeconds: transition.deadlineSeconds,
    result: transition.result,
    reject: transition.reject,
    secrets: transition.secrets as Map<string, unknown> | undefined,
  };
}

function deadline(progress: Progress, overrides: { disconnected?: string[]; players?: Player[] } = {}): Progress {
  const transition = blindRoomModule.onDeadline({
    room: roomOf(progress.publicState, progress.stage, overrides),
    publicState: progress.publicState,
    gameSecret: progress.gameSecret,
  });
  return {
    publicState: transition.publicState ?? progress.publicState,
    gameSecret: transition.gameSecret ?? progress.gameSecret,
    stage: transition.stage ?? progress.stage,
    deadlineSeconds: transition.deadlineSeconds,
    result: transition.result,
    secrets: transition.secrets as Map<string, unknown> | undefined,
  };
}

function begin(input: { players?: Player[]; settings?: unknown; seed?: number } = {}): Progress {
  const started = startGame(input);
  return {
    publicState: started.publicState,
    gameSecret: started.gameSecret as BlindRoomGameSecret,
    stage: started.stage,
    deadlineSeconds: started.deadlineSeconds,
    secrets: started.secrets as Map<string, unknown>,
  };
}

function activePlayers(overrides: { players?: Player[] } = {}): Player[] {
  return overrides.players ?? players;
}

/** 接続中の全員がreadyを送る */
function readyAll(progress: Progress, overrides: { disconnected?: string[]; players?: Player[] } = {}): Progress {
  let current = progress;
  for (const player of activePlayers(overrides)) {
    if (overrides.disconnected?.includes(player.id)) {
      continue;
    }
    current = act(current, player.id, ACTIONS.ready, {}, overrides);
  }
  return current;
}

function describerOf(progress: Progress): string {
  return progress.publicState.describerOrder[progress.publicState.roundIndex] ?? "";
}

function listenerIds(progress: Progress, overrides: { players?: Player[] } = {}): string[] {
  const describerId = describerOf(progress);
  return activePlayers(overrides)
    .map((player) => player.id)
    .filter((id) => id !== describerId);
}

/** briefing から building までを進める */
function toBuilding(progress: Progress, overrides: { disconnected?: string[]; players?: Player[] } = {}): Progress {
  const afterReady = readyAll(progress, overrides);
  return act(afterReady, describerOf(afterReady), ACTIONS.startRound, {}, overrides);
}

function sampleOf(progress: Progress): Board {
  return progress.gameSecret.samples[progress.publicState.roundIndex] ?? emptyBoard(CELL_COUNT);
}

function cellCountOfProgress(progress: Progress): number {
  return cellCountOf(progress.publicState.boardSizeId);
}

/** 見本のうち先頭 count マスだけを正しく置いた盤面 */
function partialBoard(sample: Board, count: number): Board {
  const board = emptyBoard(sample.length);
  let placed = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const cell = sample[index];
    if (cell !== null && cell !== undefined && placed < count) {
      board[index] = cell;
      placed += 1;
    }
  }
  return board;
}

function place(progress: Progress, playerId: string, cells: Board, overrides: { disconnected?: string[] } = {}) {
  return act(progress, playerId, ACTIONS.place, { cells }, overrides);
}

function secretOf(progress: Progress, playerId: string): BlindRoomSecret | undefined {
  return progress.secrets?.get(playerId) as BlindRoomSecret | undefined;
}

describe("start", () => {
  it("同じseedから同じ説明者の順と同じ見本が得られる", () => {
    const a = startGame();
    const b = startGame();
    expect(a.publicState.describerOrder).toEqual(b.publicState.describerOrder);
    expect((a.gameSecret as BlindRoomGameSecret).samples).toEqual((b.gameSecret as BlindRoomGameSecret).samples);
  });

  it("ラウンド数が参加人数と同じになり、全員が1回ずつ説明者になる", () => {
    const started = startGame();
    expect(started.publicState.totalRounds).toBe(players.length);
    expect([...started.publicState.describerOrder].sort()).toEqual(players.map((player) => player.id).sort());
  });

  it("見本はアイテムがちょうどPLACE_COUNT個で、重複がなく、そのラウンドのセットに含まれる", () => {
    const started = startGame();
    const secret = started.gameSecret as BlindRoomGameSecret;
    const pack = validPack();
    for (const [index, sample] of secret.samples.entries()) {
      const setId = secret.itemSetIds[index];
      const known = new Set((pack.itemSets.find((entry) => entry.id === setId)?.items ?? []).map((item) => item.id));
      expect(placedCount(sample)).toBe(PLACE_COUNT);
      expect(hasDuplicateItem(sample)).toBe(false);
      expect(placedItemIds(sample).every((id) => known.has(id))).toBe(true);
    }
  });

  it("説明者のレベル1〜2はeasy、3以上はstandardのセットになる", () => {
    const started = startGame();
    const secret = started.gameSecret as BlindRoomGameSecret;
    for (const [index, playerId] of started.publicState.describerOrder.entries()) {
      const level = players.find((player) => player.id === playerId)?.level ?? 1;
      expect(secret.itemSetIds[index]).toBe(level <= 2 ? "set_easy" : "set_standard");
    }
  });

  it("見本は説明者の秘密にだけ入り、聞き手の秘密には入らない", () => {
    const started = startGame();
    const describerId = started.publicState.describerOrder[0];
    for (const player of players) {
      const secret = started.secrets.get(player.id);
      if (player.id === describerId) {
        expect(secret?.role).toBe("describer");
        expect((secret as DescriberSecret).sample).toEqual((started.gameSecret as BlindRoomGameSecret).samples[0]);
      } else {
        expect(secret?.role).toBe("listener");
        expect(JSON.stringify(secret)).not.toContain("sample");
      }
    }
  });

  it("hintEnはレベル1〜2に4件、3以上に2件が渡る", () => {
    for (const level of [1, 2, 3, 5] as const) {
      const single = playersOf([level, level, level, level, level]);
      const started = startGame({ players: single });
      const describerId = started.publicState.describerOrder[0] ?? "";
      const secret = started.secrets.get(describerId) as DescriberSecret;
      expect(secret.hintEn).toHaveLength(hintCountFor(level));
    }
  });

  it("briefingから始まり、パレットは現ラウンドのセットだけを載せる", () => {
    const started = startGame();
    expect(started.stage).toBe(STAGES.briefing);
    expect(started.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.briefing);
    const setId = (started.gameSecret as BlindRoomGameSecret).itemSetIds[0];
    expect(started.publicState.itemSetId).toBe(setId);
    expect(started.publicState.palette.every((item) => item.id.startsWith(setId === "set_easy" ? "easy" : "hard"))).toBe(
      true,
    );
  });

  it("設定のbuildingSecondsが公開状態に載る", () => {
    expect(startGame({ settings: { buildingSeconds: 60 } }).publicState.buildingSeconds).toBe(60);
    expect(startGame().publicState.buildingSeconds).toBe(BUILDING_SECONDS.default);
  });
});

describe("秘密の非混入", () => {
  it("building中の公開状態に見本と聞き手の盤面が現れない", () => {
    const progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    const after = place(progress, listener, partialBoard(sampleOf(progress), PLACE_COUNT));

    // パレットは公開値のため除いたうえで、アイテムidが1つも載らないことを見る
    const serialized = JSON.stringify({ ...after.publicState, palette: [] });
    const allIds = progress.publicState.palette.map((item) => item.id);
    expect(allIds.some((id) => serialized.includes(`"${id}"`))).toBe(false);
    expect(after.publicState.donePlayerIds).toEqual([]);
  });

  it("listContents()の戻り値にアイテムが含まれない", () => {
    const serialized = JSON.stringify(blindRoomModule.listContents());
    expect(serialized).not.toContain("easy_1");
    expect(serialized).not.toContain("emoji");
  });
});

describe("startRound", () => {
  it("説明者以外はnot_describerで拒否される", () => {
    const progress = readyAll(begin());
    const other = listenerIds(progress)[0] ?? "";
    expect(act(progress, other, ACTIONS.startRound, {}).reject?.code).toBe(ERROR_CODES.notDescriber);
  });

  it("handoff以外のステージではinvalid_stageで拒否される", () => {
    const progress = begin();
    expect(act(progress, describerOf(progress), ACTIONS.startRound, {}).reject?.code).toBe(ERROR_CODES.invalidStage);
  });

  it("説明者が押すとbuildingへ進み、締切がbuildingSecondsになる", () => {
    const progress = toBuilding(begin({ settings: { buildingSeconds: 90 } }));
    expect(progress.stage).toBe(STAGES.building);
    expect(progress.deadlineSeconds).toBe(90);
  });
});

describe("place", () => {
  it("説明者からの送信はdescriber_cannot_placeで拒否される", () => {
    const progress = toBuilding(begin());
    const rejected = place(progress, describerOf(progress), emptyBoard(CELL_COUNT));
    expect(rejected.reject?.code).toBe(ERROR_CODES.describerCannotPlace);
  });

  it("9要素でない配列と型違いの要素はinvalid_boardで拒否される", () => {
    const progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    expect(act(progress, listener, ACTIONS.place, { cells: [null, null] }).reject?.code).toBe(
      ERROR_CODES.invalidBoard,
    );
    expect(act(progress, listener, ACTIONS.place, { cells: [1, 2, 3, 4, 5, 6, 7, 8, 9] }).reject?.code).toBe(
      ERROR_CODES.invalidBoard,
    );
    expect(act(progress, listener, ACTIONS.place, {}).reject?.code).toBe(ERROR_CODES.invalidBoard);
  });

  it("パレットに無いidはunknown_itemで拒否される", () => {
    const progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    const cells = emptyBoard(CELL_COUNT);
    cells[0] = "not_in_palette";
    expect(place(progress, listener, cells).reject?.code).toBe(ERROR_CODES.unknownItem);
  });

  it("PLACE_COUNTを超える配置はtoo_many_itemsで拒否される", () => {
    const progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    const cells = emptyBoard(CELL_COUNT);
    for (let index = 0; index <= PLACE_COUNT; index += 1) {
      cells[index] = progress.publicState.palette[index]?.id ?? null;
    }
    expect(place(progress, listener, cells).reject?.code).toBe(ERROR_CODES.tooManyItems);
  });

  it("同じアイテムを2マスに置くとduplicate_itemで拒否される", () => {
    const progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    const id = progress.publicState.palette[0]?.id ?? "";
    const cells = emptyBoard(CELL_COUNT);
    cells[0] = id;
    cells[4] = id;
    expect(place(progress, listener, cells).reject?.code).toBe(ERROR_CODES.duplicateItem);
  });

  it("上書きが受理され、最後の盤面で採点される", () => {
    let progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    const sample = sampleOf(progress);
    progress = place(progress, listener, emptyBoard(CELL_COUNT));
    progress = place(progress, listener, partialBoard(sample, PLACE_COUNT));
    expect(progress.gameSecret.boards[listener]).toEqual(partialBoard(sample, PLACE_COUNT));
  });

  it("受理のたびに本人へ自分の盤面が返り、他人の秘密は書き換わらない", () => {
    const progress = toBuilding(begin());
    const [listener, other] = listenerIds(progress);
    const cells = partialBoard(sampleOf(progress), 2);
    const after = place(progress, listener ?? "", cells);
    expect((secretOf(after, listener ?? "") as ListenerSecret).board).toEqual(cells);
    // 盤面を返すついでに見本を混ぜない
    expect(JSON.stringify(secretOf(after, listener ?? ""))).not.toContain("sample");
    expect(after.secrets?.has(other ?? "")).toBe(false);
  });

  it("盤面を触ると完了申告が取り消される", () => {
    let progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    progress = act(progress, listener, ACTIONS.done, { done: true });
    expect(progress.publicState.donePlayerIds).toContain(listener);
    progress = place(progress, listener, partialBoard(sampleOf(progress), 1));
    expect(progress.publicState.donePlayerIds).not.toContain(listener);
  });

  it("満杯のペイロードが共通コアの上限に収まる", () => {
    const progress = toBuilding(begin());
    const cells = sampleOf(progress);
    expect(JSON.stringify({ cells }).length).toBeLessThan(ACTION_MAX_CHARS);
  });
});

describe("done", () => {
  it("説明者からの送信は拒否される", () => {
    const progress = toBuilding(begin());
    expect(act(progress, describerOf(progress), ACTIONS.done, { done: true }).reject?.code).toBe(
      ERROR_CODES.describerCannotPlace,
    );
  });

  it("falseで取り消せる", () => {
    let progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    progress = act(progress, listener, ACTIONS.done, { done: true });
    progress = act(progress, listener, ACTIONS.done, { done: false });
    expect(progress.publicState.donePlayerIds).not.toContain(listener);
    expect(progress.stage).toBe(STAGES.building);
  });

  it("接続中の聞き手全員が申告した時点でrevealへ進む", () => {
    let progress = toBuilding(begin());
    const listeners = listenerIds(progress);
    for (const [index, listener] of listeners.entries()) {
      progress = act(progress, listener, ACTIONS.done, { done: true });
      expect(progress.stage).toBe(index === listeners.length - 1 ? STAGES.reveal : STAGES.building);
    }
    expect(progress.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.reveal);
  });

  it("未接続の聞き手は申告を待たない", () => {
    let progress = toBuilding(begin());
    const listeners = listenerIds(progress);
    const absent = listeners[listeners.length - 1] ?? "";
    for (const listener of listeners.slice(0, -1)) {
      progress = act(progress, listener, ACTIONS.done, { done: true }, { disconnected: [absent] });
    }
    expect(progress.stage).toBe(STAGES.reveal);
  });
});

describe("得点", () => {
  it("一致したマス数がそのまま聞き手の得点になる", () => {
    let progress = toBuilding(begin());
    const sample = sampleOf(progress);
    const listeners = listenerIds(progress);
    const first = listeners[0] ?? "";
    progress = place(progress, first, partialBoard(sample, 3));
    progress = deadline(progress);

    expect(pointsOf(progress.publicState.scores, first)).toBe(3);
    const record = progress.publicState.rounds[0];
    expect(record?.boards.find((board) => board.playerId === first)?.matched).toBe(3);
  });

  it("見本が空白のマスへ置いても加点も減点もされない", () => {
    let progress = toBuilding(begin());
    const sample = sampleOf(progress);
    const listener = listenerIds(progress)[0] ?? "";

    // 見本が空白のマスだけに、見本で使っていないアイテムを置く
    const spare = progress.publicState.palette.map((item) => item.id).filter((id) => !placedItemIds(sample).includes(id));
    const cells = emptyBoard(sample.length);
    let placed = 0;
    for (let index = 0; index < sample.length && placed < spare.length; index += 1) {
      if (sample[index] === null) {
        cells[index] = spare[placed] ?? null;
        placed += 1;
      }
    }

    progress = place(progress, listener, cells);
    progress = deadline(progress);
    expect(pointsOf(progress.publicState.scores, listener)).toBe(0);
  });

  it("盤面を1度も送らなかった聞き手は0点になる", () => {
    const progress = deadline(toBuilding(begin()));
    for (const listener of listenerIds(progress)) {
      expect(pointsOf(progress.publicState.scores, listener)).toBe(0);
    }
  });

  it("説明者の得点は聞き手の一致数の平均を切り捨てた値になる", () => {
    let progress = toBuilding(begin());
    const sample = sampleOf(progress);
    const listeners = listenerIds(progress);
    const counts = [5, 4, 3, 2, 1];
    for (const [index, listener] of listeners.entries()) {
      progress = place(progress, listener, partialBoard(sample, counts[index] ?? 0));
    }
    const describerId = describerOf(progress);
    progress = deadline(progress);

    // 平均 (5+4+3+2+1)/5 = 3
    expect(pointsOf(progress.publicState.scores, describerId)).toBe(3);
    expect(progress.publicState.rounds[0]?.describerPoints).toBe(3);
  });

  it("未接続の聞き手は説明者の平均から除かれる", () => {
    let progress = toBuilding(begin());
    const sample = sampleOf(progress);
    const listeners = listenerIds(progress);
    const absent = listeners[listeners.length - 1] ?? "";
    for (const listener of listeners.slice(0, -1)) {
      progress = place(progress, listener, partialBoard(sample, PLACE_COUNT));
    }
    const describerId = describerOf(progress);
    progress = deadline(progress, { disconnected: [absent] });

    // 接続中の4人が満点。未接続の1人（0マス）を含めると4点へ下がる
    expect(pointsOf(progress.publicState.scores, describerId)).toBe(PLACE_COUNT);
  });
});

describe("onDeadline", () => {
  it("briefingの締切で1ラウンド目のhandoffへ進む", () => {
    const progress = deadline(begin());
    expect(progress.stage).toBe(STAGES.handoff);
    expect(progress.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.handoff);
    expect(progress.publicState.roundIndex).toBe(0);
  });

  it("handoffの締切で説明者が接続していればbuildingへ進む", () => {
    const progress = deadline(readyAll(begin()));
    expect(progress.stage).toBe(STAGES.building);
  });

  it("buildingの締切でその時点の盤面が採点される", () => {
    let progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    progress = place(progress, listener, partialBoard(sampleOf(progress), 2));
    progress = deadline(progress);
    expect(progress.stage).toBe(STAGES.reveal);
    expect(pointsOf(progress.publicState.scores, listener)).toBe(2);
  });

  it("revealの締切で次のラウンドのhandoffへ進む", () => {
    const progress = deadline(deadline(toBuilding(begin())));
    expect(progress.stage).toBe(STAGES.handoff);
    expect(progress.publicState.roundIndex).toBe(1);
  });
});

describe("説明者の切断", () => {
  it("handoffの締切時に説明者が未接続ならそのラウンドを飛ばす", () => {
    const progress = readyAll(begin());
    const absent = describerOf(progress);
    const skipped = deadline(progress, { disconnected: [absent] });
    expect(skipped.stage).toBe(STAGES.handoff);
    expect(skipped.publicState.roundIndex).toBe(1);
    expect(skipped.publicState.rounds).toHaveLength(0);
  });

  it("残るラウンドの説明者が全員未接続ならresultを返す", () => {
    const progress = readyAll(begin());
    const skipped = deadline(progress, { disconnected: progress.publicState.describerOrder });
    expect(skipped.result).toBeDefined();
    expect(skipped.result?.rounds).toHaveLength(0);
  });
});

describe("ラウンドの進行", () => {
  it("handoffのたびに秘密が送り直され、前のラウンドの見本と盤面が残らない", () => {
    let progress = toBuilding(begin());
    const listener = listenerIds(progress)[0] ?? "";
    const firstSample = sampleOf(progress);
    progress = place(progress, listener, partialBoard(firstSample, PLACE_COUNT));
    progress = deadline(progress);
    progress = deadline(progress);

    expect(progress.publicState.roundIndex).toBe(1);
    expect(progress.gameSecret.boards).toEqual({});
    const next = secretOf(progress, listener);
    expect(next?.roundIndex).toBe(1);
    expect((next as ListenerSecret).board).toEqual(emptyBoard(CELL_COUNT));

    const describerId = describerOf(progress);
    const describerSecret = secretOf(progress, describerId) as DescriberSecret;
    expect(describerSecret.sample).toEqual(progress.gameSecret.samples[1]);
    expect(describerSecret.sample).not.toEqual(firstSample);
  });

  it("最終ラウンドの答え合わせでresultが返り、記録とアイテム一覧が入る", () => {
    let progress = begin();
    for (let round = 0; round < players.length; round += 1) {
      progress = toBuilding(progress);
      const listener = listenerIds(progress)[0] ?? "";
      progress = place(progress, listener, partialBoard(sampleOf(progress), 1));
      progress = deadline(progress);
      if (round < players.length - 1) {
        expect(progress.result).toBeUndefined();
        progress = deadline(progress);
      }
    }

    expect(progress.result).toBeDefined();
    expect(progress.result?.rounds).toHaveLength(players.length);
    expect(progress.publicState.rounds).toHaveLength(players.length);
    // easyとstandardの両方を使うため、結果には両セットのアイテムが載る
    const items = (progress.result?.items ?? []) as { id: string }[];
    expect(items.some((item) => item.id.startsWith("easy"))).toBe(true);
    expect(items.some((item) => item.id.startsWith("hard"))).toBe(true);
    // 得点は降順
    const scores = progress.result?.scores ?? [];
    expect([...scores].sort((a, b) => b.points - a.points)).toEqual(scores);
  });

  it("5人でも5ラウンドで成立する", () => {
    const five = playersOf([1, 2, 3, 4, 5]);
    const started = startGame({ players: five });
    expect(started.publicState.totalRounds).toBe(5);
  });
});

describe("設定と記述子", () => {
  it("範囲外・型違いを拒否し、範囲内の整数を受理する", () => {
    expect(blindRoomModule.validateSettings({ buildingSeconds: BUILDING_SECONDS.min }).valid).toBe(true);
    expect(blindRoomModule.validateSettings({ buildingSeconds: BUILDING_SECONDS.max }).valid).toBe(true);
    expect(blindRoomModule.validateSettings({ buildingSeconds: BUILDING_SECONDS.min - 1 }).valid).toBe(false);
    expect(blindRoomModule.validateSettings({ buildingSeconds: BUILDING_SECONDS.max + 1 }).valid).toBe(false);
    expect(blindRoomModule.validateSettings({ buildingSeconds: 70.5 }).valid).toBe(false);
    expect(blindRoomModule.validateSettings({ buildingSeconds: "90" }).valid).toBe(false);
    expect(blindRoomModule.validateSettings({}).valid).toBe(true);
    expect(blindRoomModule.validateSettings(undefined).valid).toBe(true);
  });

  it("記述子のmin/maxがvalidateSettingsの受理範囲と一致する", () => {
    const field = blindRoomModule.settingsFields.find((entry) => entry.key === "buildingSeconds");
    expect(field?.type).toBe("number");
    if (field?.type !== "number") {
      throw new Error("buildingSecondsは数値の記述子である");
    }
    expect(field.min).toBe(BUILDING_SECONDS.min);
    expect(field.max).toBe(BUILDING_SECONDS.max);
    expect(field.default).toBe(BUILDING_SECONDS.default);
  });

  it("盤面の広さの記述子が、選べる広さと既定を載せる", () => {
    const field = blindRoomModule.settingsFields.find((entry) => entry.key === "boardSizeId");
    expect(field?.type).toBe("select");
    if (field?.type !== "select") {
      throw new Error("boardSizeIdは選択の記述子である");
    }
    expect(field.options.map((option) => option.value)).toEqual(Object.keys(BOARD_SIZES));
    expect(field.default).toBe(DEFAULT_BOARD_SIZE_ID);
  });

  it("未知の広さを拒否し、既知の広さを受理する", () => {
    for (const id of Object.keys(BOARD_SIZES)) {
      expect(blindRoomModule.validateSettings({ boardSizeId: id }).valid).toBe(true);
    }
    expect(blindRoomModule.validateSettings({ boardSizeId: "huge" }).valid).toBe(false);
    expect(blindRoomModule.validateSettings({ boardSizeId: 3 }).valid).toBe(false);
  });
});

describe("盤面の広さ", () => {
  it("選んだ広さのマス数で見本を作り、公開状態に載せる", () => {
    for (const [id, size] of Object.entries(BOARD_SIZES)) {
      const started = startGame({ settings: { boardSizeId: id } });
      const cells = size.columns * size.rows;
      expect(started.publicState.boardSizeId).toBe(id);
      for (const sample of (started.gameSecret as BlindRoomGameSecret).samples) {
        expect(sample).toHaveLength(cells);
        // 広さが変わっても置く数は変わらない（満点を揃える）
        expect(placedCount(sample)).toBe(PLACE_COUNT);
      }
    }
  });

  it("未知の広さを渡されても既定で開始する", () => {
    const started = startGame({ settings: { boardSizeId: "huge" } });
    expect(started.publicState.boardSizeId).toBe(DEFAULT_BOARD_SIZE_ID);
  });

  it("広さの違う盤面は invalid_board で拒否される", () => {
    const progress = toBuilding(begin({ settings: { boardSizeId: "advanced" } }));
    const listener = listenerIds(progress)[0] ?? "";
    expect(cellCountOfProgress(progress)).toBe(16);
    // 3×3の盤面を送る
    expect(place(progress, listener, emptyBoard(9)).reject?.code).toBe(ERROR_CODES.invalidBoard);
    expect(place(progress, listener, emptyBoard(16)).reject).toBeUndefined();
  });

  it("上級（4×4）でも満点はPLACE_COUNTのままになる", () => {
    let progress = toBuilding(begin({ settings: { boardSizeId: "advanced" } }));
    const listener = listenerIds(progress)[0] ?? "";
    progress = place(progress, listener, partialBoard(sampleOf(progress), PLACE_COUNT));
    progress = deadline(progress);
    expect(pointsOf(progress.publicState.scores, listener)).toBe(PLACE_COUNT);
  });

  it("満杯のplaceペイロードが、いちばん広い盤面でも共通コアの上限に収まる", () => {
    const progress = toBuilding(begin({ settings: { boardSizeId: "advanced" } }));
    const cells = sampleOf(progress);
    expect(JSON.stringify({ cells }).length).toBeLessThan(ACTION_MAX_CHARS);
  });
});
