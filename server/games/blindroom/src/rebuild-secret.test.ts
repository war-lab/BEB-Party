// rebuildSecret の突き合わせ（基本設計/12の再接続での作り直し、ADR-0029）。
//
// 遷移が返した secrets を playerId ごとに上書きで溜めたもの（共通コアの playerSecrets と同じ）と、
// その時点の rebuildSecret の戻り値を、各遷移の直後に全員について比べる。
// 作り直しに切り替えた後に、再接続した聞き手の盤面が消える退行（特に開示中と終局後）を防ぐ。
import {
  ACTIONS,
  STAGES,
  emptyBoard,
  type BlindRoomPublic,
  type BlindRoomSecret,
  type Board,
  type ListenerSecret,
} from "@beb/shared-blindroom";
import type { GameTransition, Player, Room } from "@beb/shared-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlindRoomGameSecret } from "./module";
import { playersOf, validPack } from "./test-support/fixtures";

// 本番のcontent/を読ませない。PACKS をテストから差し替え、コンテンツの欠落を再現する
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
const { PACKS } = await import("./packs");

const PACK_ID = "fixture_pack";

afterEach(() => {
  PACKS.splice(0, PACKS.length, validPack());
});

type Transition = GameTransition<BlindRoomPublic, unknown, BlindRoomGameSecret>;

/** 共通コアが持つ部屋の状態のうち、突き合わせに要る部分 */
class Session {
  publicState: BlindRoomPublic;
  gameSecret: BlindRoomGameSecret | undefined;
  stage: string;
  lifecycle: Room["lifecycle"] = "playing";
  disconnected = new Set<string>();
  /** 共通コアの playerSecrets と同じく、playerId ごとに上書きで溜める */
  readonly stored = new Map<string, unknown>();
  /** 突き合わせを行った時点のステージと終局の有無。経路を通ったことの確認に使う */
  readonly visited: string[] = [];

  constructor(
    readonly players: Player[],
    settings: unknown = {},
    seed = 4242,
  ) {
    const started = blindRoomModule.start({ players, contentId: PACK_ID, settings, seed });
    this.publicState = started.publicState;
    this.gameSecret = started.gameSecret;
    this.stage = started.stage;
    this.store(started.secrets);
    this.verify();
  }

  room(): Room {
    return {
      code: "ABCD",
      lifecycle: this.lifecycle,
      players: this.players.map((player) =>
        this.disconnected.has(player.id) ? { ...player, connected: false } : player,
      ),
      gameId: "g",
      contentId: PACK_ID,
      stage: this.stage,
      gameState: this.publicState,
    };
  }

  describer(): string {
    return this.publicState.describerOrder[this.publicState.roundIndex] ?? "";
  }

  listeners(): string[] {
    return this.players.map((player) => player.id).filter((id) => id !== this.describer());
  }

  act(playerId: string, action: string, payload: unknown = {}): Transition {
    const transition = blindRoomModule.handleAction({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
      playerId,
      action,
      payload,
    });
    this.apply(transition);
    return transition;
  }

  deadline(): Transition {
    const transition = blindRoomModule.onDeadline({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
    });
    this.apply(transition);
    return transition;
  }

  place(playerId: string, cells: Board): Transition {
    const transition = this.act(playerId, ACTIONS.place, { roundIndex: this.publicState.roundIndex, cells });
    expect(transition.reject).toBeUndefined();
    return transition;
  }

  /** 接続中の全員が ready を送る */
  readyAll(): void {
    for (const player of this.players) {
      if (!this.disconnected.has(player.id)) {
        this.act(player.id, ACTIONS.ready);
      }
    }
  }

  /** 見本のうち先頭 count 個だけを正しく置いた盤面 */
  partial(count: number): Board {
    const sample = this.gameSecret?.samples[this.publicState.roundIndex] ?? [];
    const board = emptyBoard(sample.length);
    let placed = 0;
    for (const [index, cell] of sample.entries()) {
      if (cell !== null && placed < count) {
        board[index] = cell;
        placed += 1;
      }
    }
    return board;
  }

  rebuild(playerId: string): BlindRoomSecret | undefined {
    return blindRoomModule.rebuildSecret?.({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
      playerId,
    });
  }

  private store(secrets: Map<string, unknown> | undefined): void {
    for (const [playerId, secret] of secrets ?? []) {
      this.stored.set(playerId, secret);
    }
  }

  private apply(transition: Transition): void {
    if (transition.reject === undefined) {
      this.publicState = transition.publicState ?? this.publicState;
      this.gameSecret = transition.gameSecret ?? this.gameSecret;
      this.stage = transition.stage ?? this.stage;
      this.store(transition.secrets);
      if (transition.result !== undefined) {
        this.lifecycle = "finished";
      }
    }
    this.verify();
  }

  /** 全員について、保存済みの値と作り直した値が一致することを確かめる */
  private verify(): void {
    this.visited.push(this.lifecycle === "finished" ? "finished" : this.stage);
    for (const player of this.players) {
      expect(this.rebuild(player.id), `${this.lifecycle}/${this.stage} ${player.id}`).toEqual(
        this.stored.get(player.id),
      );
    }
  }
}

function listenerBoard(session: Session, playerId: string): Board | undefined {
  const secret = session.rebuild(playerId);
  return secret?.role === "listener" ? (secret as ListenerSecret).board : undefined;
}

function nonEmpty(board: Board | undefined): boolean {
  return (board ?? []).some((cell) => cell !== null);
}

/** 1ラウンドを「置く・置き直す・置かないまま締切」で進め、building の締切で reveal へ入る */
function playRoundByDeadline(session: Session): void {
  expect(session.stage).toBe(STAGES.handoff);
  session.act(session.describer(), ACTIONS.startRound);
  const [first, second] = session.listeners();
  if (first !== undefined) {
    session.place(first, session.partial(2));
    // 置き直し
    session.place(first, session.partial(4));
  }
  if (second !== undefined) {
    session.place(second, session.partial(1));
  }
  // 残りの聞き手は置かないまま締切を迎える
  session.deadline();
}

/** 1ラウンドを全員の done で進め、reveal へ入る */
function playRoundByDone(session: Session): void {
  expect(session.stage).toBe(STAGES.handoff);
  session.act(session.describer(), ACTIONS.startRound);
  const listeners = session.listeners();
  for (const [index, playerId] of listeners.entries()) {
    if (index % 2 === 0) {
      session.place(playerId, session.partial(index + 1));
    }
    session.act(playerId, ACTIONS.done);
  }
  // 最後の1人の done で reveal へ進むので、ここには来ない前提を確かめる
  expect(session.stage).toBe(STAGES.reveal);
}

describe("rebuildSecret: 遷移が送った値との突き合わせ", () => {
  it("6人・1周。ready と締切の両方で進め、置き直し・done の取り消し・置かないままの締切を通して終局する", () => {
    const session = new Session(playersOf([1, 2, 3, 4, 5, 5]));

    // briefing: 一部だけ ready → 残りも ready で handoff
    session.act("p1", ACTIONS.ready);
    session.readyAll();
    expect(session.stage).toBe(STAGES.handoff);

    // ラウンド0: done の取り消し、done 後の place、全員の done で reveal
    session.act(session.describer(), ACTIONS.startRound);
    const listeners = session.listeners();
    const [a, b] = listeners;
    session.place(a!, session.partial(3));
    session.act(a!, ACTIONS.done);
    session.act(a!, ACTIONS.done, { done: false });
    session.act(a!, ACTIONS.done);
    // done の後の place で申告が外れる
    session.place(a!, session.partial(5));
    session.place(b!, session.partial(2));
    for (const playerId of listeners) {
      session.act(playerId, ACTIONS.done);
    }
    expect(session.stage).toBe(STAGES.reveal);
    expect(session.lifecycle).toBe("playing");
    // 開示中も、置いた聞き手の手元の盤面が残る
    expect(nonEmpty(listenerBoard(session, a!))).toBe(true);
    // 開示中の place は拒否され、保存値も変わらない
    const rejected = session.act(a!, ACTIONS.place, {
      roundIndex: session.publicState.roundIndex,
      cells: session.partial(1),
    });
    expect(rejected.reject).toBeDefined();

    // reveal: ready で進める
    session.readyAll();
    expect(session.stage).toBe(STAGES.handoff);

    // ラウンド1: handoff の締切で building、building の締切で reveal、reveal の締切で次へ
    session.deadline();
    expect(session.stage).toBe(STAGES.building);
    const [c] = session.listeners();
    session.place(c!, session.partial(4));
    session.deadline();
    expect(session.stage).toBe(STAGES.reveal);
    expect(nonEmpty(listenerBoard(session, c!))).toBe(true);
    session.deadline();
    expect(session.stage).toBe(STAGES.handoff);

    // 残りのラウンドを交互に進め、最終ラウンドの reveal で終局する
    let round = 2;
    while (session.lifecycle === "playing") {
      if (round % 2 === 0) {
        playRoundByDone(session);
      } else {
        playRoundByDeadline(session);
      }
      if (session.lifecycle === "playing") {
        session.deadline();
      }
      round += 1;
    }
    expect(round).toBe(6);
    expect(session.stage).toBe(STAGES.reveal);
    // 終局後も、最終ラウンドで置いた聞き手の盤面が残る
    expect(session.listeners().some((playerId) => nonEmpty(listenerBoard(session, playerId)))).toBe(true);
    expect(session.visited).toEqual(expect.arrayContaining(["briefing", "handoff", "building", "reveal", "finished"]));
  });

  it("3人・2周。briefing の締切で始め、全ラウンドを締切で進めて終局する", () => {
    const session = new Session(playersOf([1, 3, 5]), { laps: "2" });
    expect(session.publicState.totalRounds).toBe(6);

    session.deadline();
    expect(session.stage).toBe(STAGES.handoff);
    while (session.lifecycle === "playing") {
      playRoundByDeadline(session);
      if (session.lifecycle === "playing") {
        session.deadline();
      }
    }
    expect(session.publicState.rounds).toHaveLength(6);
    expect(session.listeners().some((playerId) => nonEmpty(listenerBoard(session, playerId)))).toBe(true);
  });

  it("3人・2周。全ラウンドを done で進めて終局する", () => {
    const session = new Session(playersOf([2, 2, 4]), { laps: "2" });
    session.readyAll();
    while (session.lifecycle === "playing") {
      playRoundByDone(session);
      if (session.lifecycle === "playing") {
        session.readyAll();
      }
    }
    expect(session.publicState.rounds).toHaveLength(6);
  });

  it("説明者が未接続のラウンドを handoff の締切で飛ばし、その後も一致する", () => {
    const session = new Session(playersOf([1, 2, 3, 4, 5]));
    session.readyAll();
    playRoundByDeadline(session);

    // 次のラウンドの説明者を落としてから進める
    const skipped = session.publicState.describerOrder[1]!;
    session.disconnected.add(skipped);
    session.deadline();
    expect(session.stage).toBe(STAGES.handoff);
    expect(session.publicState.roundIndex).toBe(1);
    session.deadline();
    expect(session.stage).toBe(STAGES.handoff);
    expect(session.publicState.roundIndex).toBe(2);

    // 戻ってきても、飛ばしたラウンドへは戻らない
    session.disconnected.delete(skipped);
    playRoundByDone(session);
    session.readyAll();
    expect(session.publicState.roundIndex).toBe(3);
  });

  it("残るラウンドの説明者が全員未接続で終局した場合、飛ばしたラウンドの handoff の値と一致する", () => {
    const session = new Session(playersOf([1, 2, 3, 4, 5, 5]));
    session.readyAll();
    playRoundByDeadline(session);
    session.deadline();
    playRoundByDone(session);
    session.readyAll();
    expect(session.publicState.roundIndex).toBe(2);

    // ラウンド2〜5の説明者を全員落とす
    for (const playerId of session.publicState.describerOrder.slice(2)) {
      session.disconnected.add(playerId);
    }
    session.deadline();
    expect(session.lifecycle).toBe("finished");
    expect(session.publicState.rounds.at(-1)?.roundIndex).toBe(1);
    expect(session.publicState.roundIndex).toBe(2);
    // 最後に送ったのは飛ばしたラウンドの handoff であり、聞き手の盤面は空
    for (const playerId of session.listeners()) {
      expect(nonEmpty(listenerBoard(session, playerId))).toBe(false);
    }
  });

  it("1ラウンドも記録せずに飛ばして終局した場合も一致する", () => {
    const session = new Session(playersOf([1, 3, 5]));
    session.readyAll();
    for (const player of session.players) {
      session.disconnected.add(player.id);
    }
    session.deadline();
    expect(session.lifecycle).toBe("finished");
    expect(session.publicState.rounds).toHaveLength(0);
  });
});

describe("rebuildSecret: コンテンツの欠落と入力の異常", () => {
  function inBuilding(): Session {
    const session = new Session(playersOf([1, 2, 3, 4, 5]));
    session.readyAll();
    session.act(session.describer(), ACTIONS.startRound);
    session.place(session.listeners()[0]!, session.partial(3));
    return session;
  }

  it("パックが見つからないとき、説明者の作り直しは例外を投げる", () => {
    const session = inBuilding();
    PACKS.splice(0, PACKS.length);
    expect(() => session.rebuild(session.describer())).toThrow();
  });

  it("アイテムセットが見つからないとき、説明者の作り直しは例外を投げる（hintEnを空にして劣化させない）", () => {
    const session = inBuilding();
    const setId = session.gameSecret!.itemSetIds[session.publicState.roundIndex];
    const pack = PACKS[0]!;
    pack.itemSets = pack.itemSets.filter((entry) => entry.id !== setId);
    expect(() => session.rebuild(session.describer())).toThrow(/アイテムセット/);
  });

  it("聞き手はコンテンツを読まないため、パックが消えても作り直せる", () => {
    const session = inBuilding();
    const listener = session.listeners()[0]!;
    PACKS.splice(0, PACKS.length);
    expect(session.rebuild(listener)).toEqual(session.stored.get(listener));
  });

  it("説明者の hintEn は再接続した時点のパックから引く", () => {
    const session = inBuilding();
    const setId = session.gameSecret!.itemSetIds[session.publicState.roundIndex];
    const set = PACKS[0]!.itemSets.find((entry) => entry.id === setId)!;
    set.describerHints = set.describerHints.map((hint) => `${hint} (new)`);
    const secret = session.rebuild(session.describer());
    expect(secret?.role).toBe("describer");
    expect(secret && "hintEn" in secret ? secret.hintEn.every((hint) => hint.endsWith("(new)")) : false).toBe(true);
  });

  it("gameSecret が無いときは例外を投げる", () => {
    const session = inBuilding();
    session.gameSecret = undefined;
    expect(() => session.rebuild(session.describer())).toThrow();
  });

  it("参加者でない playerId には undefined を返す", () => {
    const session = inBuilding();
    expect(session.rebuild("stranger")).toBeUndefined();
  });

  it("未知のステージでは例外を投げる", () => {
    const session = inBuilding();
    session.stage = "unknown";
    expect(() => session.rebuild(session.listeners()[0]!)).toThrow();
  });
});
