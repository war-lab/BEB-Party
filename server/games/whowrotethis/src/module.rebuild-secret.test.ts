// rebuildSecret の一致（基本設計/11のテスト観点、ADR-0029）。
//
// 共通コアは遷移が返した secrets を playerId ごとに上書きで保存し、再接続した人へは
// rebuildSecret の戻り値を送る。作り直しが保存済みの値とずれると、再接続した人の手元から
// 自分の提出文や slot が消える・変わる。そこで遷移のたびに、全員分を保存済みの値と突き合わせる。
import type { GameTransition, Player, Room } from "@beb/shared-core";
import {
  ACTIONS,
  STAGES,
  type WhoWroteThisPack,
  type WhoWroteThisPublic,
  type WhoWroteThisResult,
  type WhoWroteThisSecret,
} from "@beb/shared-whowrotethis";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WhoWroteThisGameSecret } from "./module";
import { playersOf, validPack } from "./test-support/fixtures";

// デプロイ後のコンテンツ差し替えを再現するため、テストからパックを書き換えられるようにする
const content = vi.hoisted(() => ({ packs: [] as WhoWroteThisPack[] }));

// 本番のcontent/を読ませない。テストは固定のパックだけを見る
vi.mock("./packs", async () => {
  const { validPack: pack } = await import("./test-support/fixtures");
  const { summarize } = await vi.importActual<typeof import("./packs")>("./packs");
  content.packs = [pack()];
  return {
    PACKS: content.packs,
    findPack: (packId: string) => content.packs.find((entry) => entry.id === packId),
    summarize,
  };
});

const { whoWroteThisModule } = await import("./module");

const PACK_ID = "fixture_pack";
const SEED = 4242;

afterEach(() => {
  content.packs.splice(0, content.packs.length, validPack());
});

type Transition = GameTransition<WhoWroteThisPublic, WhoWroteThisResult, WhoWroteThisGameSecret>;

/**
 * 共通コアの代わりに状態を持つ。
 *
 * secrets は上書きで溜め、result が返ったら lifecycle を finished にする（基本設計/01）。
 */
class Session {
  readonly players: Player[];
  lifecycle: Room["lifecycle"] = "playing";
  stage: string;
  publicState: WhoWroteThisPublic;
  gameSecret: WhoWroteThisGameSecret;
  readonly stored = new Map<string, WhoWroteThisSecret>();
  disconnected: string[] = [];
  /** 突き合わせたステージの記録。分岐を通ったことをテストの末尾で確かめる */
  readonly visited: string[] = [];

  constructor(players: Player[]) {
    this.players = players;
    const started = whoWroteThisModule.start({ players, contentId: PACK_ID, settings: {}, seed: SEED });
    this.stage = started.stage;
    this.publicState = started.publicState;
    this.gameSecret = started.gameSecret as WhoWroteThisGameSecret;
    this.store(started.secrets as Map<string, WhoWroteThisSecret> | undefined);
    this.verify("start");
  }

  room(): Room {
    return {
      code: "ABCD",
      lifecycle: this.lifecycle,
      players: this.players.map((player) =>
        this.disconnected.includes(player.id) ? { ...player, connected: false } : player,
      ),
      gameId: "g",
      contentId: PACK_ID,
      stage: this.stage,
      gameState: this.publicState,
    };
  }

  act(playerId: string, action: string, payload: unknown): void {
    const transition = whoWroteThisModule.handleAction({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
      playerId,
      action,
      payload,
    });
    expect(transition.reject, `${action} by ${playerId} at ${this.stage}`).toBeUndefined();
    this.apply(transition, `${this.stage}:${action}`);
  }

  deadline(): void {
    const transition = whoWroteThisModule.onDeadline({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
    });
    this.apply(transition, `${this.stage}:deadline`);
  }

  /** 表示中の件の作者。gameSecretの開示順と提出から引く */
  authorId(): string {
    const presented = this.publicState.presented;
    const roundIndex = this.publicState.roundIndex;
    const submissions = this.gameSecret.submissions[roundIndex] ?? {};
    const order = (this.gameSecret.revealOrders[roundIndex] ?? []).filter(
      (playerId) => submissions[playerId] !== undefined,
    );
    return presented === null ? "" : (order[presented.index] ?? "");
  }

  rebuild(playerId: string): WhoWroteThisSecret | undefined {
    return whoWroteThisModule.rebuildSecret?.({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
      playerId,
    });
  }

  private apply(transition: Transition, label: string): void {
    this.publicState = transition.publicState ?? this.publicState;
    this.gameSecret = transition.gameSecret ?? this.gameSecret;
    this.stage = transition.stage ?? this.stage;
    if (transition.result !== undefined) {
      this.lifecycle = "finished";
    }
    this.store(transition.secrets as Map<string, WhoWroteThisSecret> | undefined);
    this.verify(label);
  }

  private store(secrets: Map<string, WhoWroteThisSecret> | undefined): void {
    for (const [playerId, secret] of secrets ?? []) {
      this.stored.set(playerId, secret);
    }
  }

  /** 全員について、保存済みの値と作り直した値が一致することを確かめる */
  private verify(label: string): void {
    this.visited.push(`${this.lifecycle}:${this.stage}`);
    for (const player of this.players) {
      const stored = this.stored.get(player.id);
      expect(stored, `${label} ${player.id} は秘密情報を受け取っている`).toBeDefined();
      expect(this.rebuild(player.id), `${label} 直後の ${player.id}`).toEqual(stored);
    }
  }
}

function textOf(playerId: string, version = 1): string {
  return `I am player ${playerId} version ${version}.`;
}

/** 表示中の件を、作者以外の全員の指名で答え合わせへ進める */
function guessAll(session: Session): void {
  const presented = session.publicState.presented;
  if (presented === null) {
    throw new Error("開示中の件が無い");
  }
  const authorId = session.authorId();
  for (const player of session.players) {
    if (player.id === authorId || session.disconnected.includes(player.id)) {
      continue;
    }
    session.act(player.id, ACTIONS.guess, { index: presented.index, targetPlayerId: authorId });
  }
}

/**
 * guessing と judging を繰り返し、reveal まで進める。
 *
 * 件ごとに指名の揃い方を変え、全員の指名で進む分岐と、一部だけ指名して締切で進む分岐を両方通す。
 */
function playItems(session: Session): void {
  let item = 0;
  while (session.stage === STAGES.guessing) {
    if (item % 2 === 0) {
      guessAll(session);
    } else {
      // 1人だけ指名し、残りは締切で棄権にする
      const presented = session.publicState.presented;
      const authorId = session.authorId();
      const guesser = session.players.find((player) => player.id !== authorId);
      if (presented !== null && guesser !== undefined) {
        session.act(guesser.id, ACTIONS.guess, { index: presented.index, targetPlayerId: authorId });
      }
      session.deadline();
    }
    expect(session.stage).toBe(STAGES.judging);
    session.deadline();
    item += 1;
  }
  expect(session.stage).toBe(STAGES.reveal);
}

describe("rebuildSecret", () => {
  it("一部だけ提出して締切・readyで進行する経路で、全遷移の直後に保存済みの値と一致する", () => {
    const session = new Session(playersOf([1, 2, 3, 4, 5, 5]));

    // ラウンド1: briefing を ready で進める。途中の ready でも一致する
    session.act("p1", ACTIONS.ready, {});
    for (const player of session.players.slice(1)) {
      session.act(player.id, ACTIONS.ready, {});
    }
    expect(session.stage).toBe(STAGES.writing);

    // 一部だけ提出し、上書きもする。未提出者は briefing の値のまま残る
    session.act("p1", ACTIONS.submit, { text: textOf("p1") });
    session.act("p3", ACTIONS.submit, { text: textOf("p3") });
    session.act("p1", ACTIONS.submit, { text: `  ${textOf("p1", 2)}\n  ` });
    session.act("p4", ACTIONS.submit, { text: textOf("p4") });
    expect(session.stored.get("p1")?.submission).toBe(textOf("p1", 2));
    expect(session.stored.get("p2")?.submission).toBeUndefined();

    session.deadline();
    expect(session.stage).toBe(STAGES.guessing);
    playItems(session);

    // 開示を ready で終えて次のラウンドへ進める
    for (const player of session.players) {
      session.act(player.id, ACTIONS.ready, {});
    }
    expect(session.stage).toBe(STAGES.briefing);
    expect(session.publicState.roundIndex).toBe(1);
    // 前のラウンドの提出は作り直しでも戻らない
    expect(session.rebuild("p1")?.submission).toBeUndefined();

    // ラウンド2: briefing を締切で進め、全員の提出で guessing へ進める
    session.deadline();
    expect(session.stage).toBe(STAGES.writing);
    for (const player of session.players) {
      session.act(player.id, ACTIONS.submit, { text: textOf(player.id) });
    }
    expect(session.stage).toBe(STAGES.guessing);
    playItems(session);

    expect(session.lifecycle).toBe("finished");
    expect(session.visited).toContain("finished:reveal");
    // 終局後も最終ラウンドの提出と slot が届く
    for (const player of session.players) {
      expect(session.rebuild(player.id)?.submission).toBe(textOf(player.id));
      expect(session.rebuild(player.id)?.roundIndex).toBe(1);
    }
  });

  it("開示を締切で進め、提出0件のラウンドと切断中の作者を含む経路でも一致する", () => {
    const session = new Session(playersOf([1, 1, 3, 3, 5]));

    // ラウンド1: 提出0件のまま締切。開示を経ずに reveal へ進む
    session.deadline();
    expect(session.stage).toBe(STAGES.writing);
    session.deadline();
    expect(session.stage).toBe(STAGES.reveal);

    // 開示を締切で終えて次のラウンドへ進める
    session.deadline();
    expect(session.stage).toBe(STAGES.briefing);
    expect(session.publicState.roundIndex).toBe(1);

    // ラウンド2: 1人が切断する。切断前に提出した文も作り直しで届く
    for (const player of session.players) {
      session.act(player.id, ACTIONS.ready, {});
    }
    session.act("p2", ACTIONS.submit, { text: textOf("p2") });
    session.disconnected = ["p2"];
    for (const player of session.players.filter((entry) => entry.id !== "p2")) {
      session.act(player.id, ACTIONS.submit, { text: textOf(player.id) });
    }
    expect(session.stage).toBe(STAGES.guessing);
    expect(session.rebuild("p2")?.submission).toBe(textOf("p2"));
    playItems(session);

    expect(session.lifecycle).toBe("finished");
  });

  it("参加者でない人には何も作らない", () => {
    const session = new Session(playersOf([1, 2, 3, 4, 5]));
    expect(session.rebuild("stranger")).toBeUndefined();
  });

  it("hintEn は再接続した時点のコンテンツから引く", () => {
    const session = new Session(playersOf([1, 2, 3, 4, 5]));
    const questionId = session.gameSecret.questionIds[0];
    const question = content.packs[0]?.questions.find((entry) => entry.id === questionId);
    if (question === undefined) {
      throw new Error("抽選された質問がパックに無い");
    }
    // デプロイで言い回しの例が差し替わった状態を再現する
    question.hintEn = ["New hint is ... here.", "Another ... hint.", "Third ... hint."];

    expect(session.rebuild("p1")?.hintEn).toEqual(question.hintEn);
    expect(session.rebuild("p5")?.hintEn).toEqual(["New hint is ... here."]);
    // hintEn 以外は保存済みの値と変わらない
    const { hintEn: _rebuilt, ...rest } = session.rebuild("p1") ?? { hintEn: [] };
    const { hintEn: _stored, ...storedRest } = session.stored.get("p1") ?? { hintEn: [] };
    expect(rest).toEqual(storedRest);
  });

  it("パックが見つからないときは undefined ではなく例外を投げる", () => {
    const session = new Session(playersOf([1, 2, 3, 4, 5]));
    // デプロイでパックが消えた状態を再現する
    content.packs.splice(0, content.packs.length);
    expect(() => session.rebuild("p1")).toThrow();
  });

  it("質問が見つからないときは undefined ではなく例外を投げる", () => {
    const session = new Session(playersOf([1, 2, 3, 4, 5]));
    // デプロイで抽選済みの質問が消えた状態を再現する
    const pack = content.packs[0];
    if (pack === undefined) {
      throw new Error("パックが無い");
    }
    const questionId = session.gameSecret.questionIds[0];
    pack.questions = pack.questions.filter((entry) => entry.id !== questionId);
    expect(() => session.rebuild("p1")).toThrow();
  });

  it("gameSecret が無いときは例外を投げる", () => {
    const session = new Session(playersOf([1, 2, 3, 4, 5]));
    expect(() =>
      whoWroteThisModule.rebuildSecret?.({
        room: session.room(),
        publicState: session.publicState,
        gameSecret: undefined,
        playerId: "p1",
      }),
    ).toThrow();
  });
});
