// GameModuleの振る舞い。Durable Objectなしで全項目を確かめる（基本設計/15のテスト観点）。
//
// Session が共通コアの代わりに状態を持ち、遷移のたびに次を確かめる。
// - 遷移が返した秘密を上書きで溜めた値と、rebuildSecret の戻り値が全員について一致すること（ADR-0029）
// - 公開状態のキーと配列の要素のキーが許可リストと一致すること（名前を変えた漏洩を落とす）
// - input 中の公開状態に提出した語が現れず、どのステージにも後のラウンドのお題が現れないこと（ADR-0003）
import { ACTION_MAX_CHARS, type GameTransition, type Player, type Room } from "@beb/shared-core";
import {
  ACTIONS,
  BRIEFING_SECONDS,
  ERROR_CODES,
  INPUT_SECONDS,
  MAX_ATTEMPTS,
  MAX_ROUNDS,
  MAX_WORD_CHARS,
  REVEAL_SECONDS,
  STAGES,
  TEAM_SIZES,
  type MindMeldPublic,
  type MindMeldResult,
  type MindMeldSecret,
  type TeamAttempt,
  type TeamPublic,
} from "@beb/shared-mindmeld";
import { describe, expect, it, vi } from "vitest";
import type { MindMeldGameSecret } from "./module";
import { playersOf } from "./test-support/fixtures";

// 本番のcontent/のパックを読ませない。テストは固定のパックだけを見る
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

const { mindMeldModule } = await import("./module");

const PACK_ID = "fixture_pack";
const SEED = 2026;

/** 公開状態に置いてよいキー（15の公開状態）。足すときは秘密を載せないことを確かめてから足す */
const PUBLIC_KEYS = [
  "packId",
  "teams",
  "roundIndex",
  "maxRounds",
  "attemptIndex",
  "maxAttempts",
  "prompt",
  "activePlayerIds",
  "submittedPlayerIds",
  "readyPlayerIds",
  "usedKeys",
  "attempts",
  "rounds",
  "scores",
  "keyExpressions",
  "inputSeconds",
] as const;

type Transition = GameTransition<MindMeldPublic, MindMeldResult, MindMeldGameSecret>;

/**
 * 重ならない語を作る。左の語は a〜m、右の語は n〜z の6文字であり、左右の組は近い語にならない
 * （編集距離が6になる）。お題の語にも当たらない。
 */
function syntheticWord(index: number, side: "left" | "right"): string {
  const base = side === "left" ? 97 : 110;
  let rest = index;
  let word = "";
  for (let position = 0; position < 6; position += 1) {
    word = String.fromCharCode(base + (rest % 13)) + word;
    rest = Math.floor(rest / 13);
  }
  return word;
}

/** 共通コアの代わりに状態を持つ。secrets は上書きで溜め、result が返ったら finished にする */
class Session {
  readonly players: Player[];
  lifecycle: Room["lifecycle"] = "playing";
  stage: string;
  publicState: MindMeldPublic;
  gameSecret: MindMeldGameSecret;
  deadlineSeconds: number | undefined;
  readonly stored = new Map<string, MindMeldSecret>();
  /** 直前の遷移が返した秘密情報。送らなかった遷移では undefined */
  lastSecrets: Map<string, unknown> | undefined;
  result: MindMeldResult | undefined;
  disconnected: string[] = [];
  private counter = 0;

  constructor(playerCount: number, input: { seed?: number; settings?: unknown; players?: Player[] } = {}) {
    this.players = input.players ?? playersOf(playerCount);
    const started = mindMeldModule.start({
      players: this.players,
      contentId: PACK_ID,
      settings: input.settings ?? {},
      seed: input.seed ?? SEED,
    });
    this.stage = started.stage;
    this.deadlineSeconds = started.deadlineSeconds;
    this.publicState = started.publicState;
    this.gameSecret = started.gameSecret as MindMeldGameSecret;
    this.lastSecrets = started.secrets;
    for (const [id, secret] of started.secrets) {
      this.stored.set(id, secret);
    }
    this.verify();
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

  /** action を送る。拒否されたらコードを返し、状態は変えない */
  act(playerId: string, action: string, payload?: unknown): string | undefined {
    const before = JSON.stringify([this.publicState, this.gameSecret, this.stage]);
    const transition = mindMeldModule.handleAction({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
      playerId,
      action,
      payload,
    });
    if (transition.reject !== undefined) {
      // 拒否は状態を変えない（15の action の受理規則）
      expect(transition).toEqual({ reject: transition.reject });
      expect(JSON.stringify([this.publicState, this.gameSecret, this.stage])).toBe(before);
      return transition.reject.code;
    }
    this.apply(transition);
    return undefined;
  }

  /** 拒否されないことを確かめて送る */
  must(playerId: string, action: string, payload?: unknown): void {
    expect(this.act(playerId, action, payload), `${action} by ${playerId} at ${this.stage}`).toBeUndefined();
  }

  deadline(): void {
    this.apply(
      mindMeldModule.onDeadline({ room: this.room(), publicState: this.publicState, gameSecret: this.gameSecret }),
    );
  }

  submit(playerId: string, word: string): string | undefined {
    return this.act(playerId, ACTIONS.submit, {
      roundIndex: this.publicState.roundIndex,
      attemptIndex: this.publicState.attemptIndex,
      word,
    });
  }

  claim(playerId: string): string | undefined {
    return this.act(playerId, ACTIONS.claim, {
      roundIndex: this.publicState.roundIndex,
      attemptIndex: this.publicState.attemptIndex,
    });
  }

  object(playerId: string, teamId: string, objecting = true): string | undefined {
    return this.act(playerId, ACTIONS.object, {
      roundIndex: this.publicState.roundIndex,
      attemptIndex: this.publicState.attemptIndex,
      teamId,
      objecting,
    });
  }

  /** 接続中の全員が ready を送る */
  readyAll(): void {
    const stage = this.stage;
    for (const player of this.players) {
      if (this.stage !== stage) {
        break;
      }
      if (!this.disconnected.includes(player.id)) {
        this.must(player.id, ACTIONS.ready);
      }
    }
  }

  teams(): TeamPublic[] {
    return this.publicState.teams;
  }

  team(teamId: string): TeamPublic {
    const found = this.publicState.teams.find((entry) => entry.id === teamId);
    if (found === undefined) {
      throw new Error(`チームが無い: ${teamId}`);
    }
    return found;
  }

  trio(): TeamPublic | undefined {
    return this.publicState.teams.find((entry) => entry.memberIds.length === 3);
  }

  /** このチームのうち、この試行で語を出す人 */
  speakers(teamId: string): string[] {
    return this.publicState.activePlayerIds.filter((playerId) => this.team(teamId).memberIds.includes(playerId));
  }

  /** 使ったことのない語の組（左右で近い語にならない） */
  freshPair(): [string, string] {
    this.counter += 1;
    return [syntheticWord(this.counter, "left"), syntheticWord(this.counter, "right")];
  }

  /** チームの語を出す2人が提出する。match なら同じ語、そうでなければ違う語 */
  submitTeam(teamId: string, match: boolean): [string, string] {
    const [left, right] = this.freshPair();
    const words: [string, string] = match ? [left, left] : [left, right];
    const [first, second] = this.speakers(teamId);
    if (first === undefined || second === undefined) {
      throw new Error(`語を出す人が2人いない: ${teamId}`);
    }
    if (!this.disconnected.includes(first)) {
      expect(this.submit(first, words[0])).toBeUndefined();
    }
    if (!this.disconnected.includes(second) && this.stage === STAGES.input) {
      expect(this.submit(second, words[1])).toBeUndefined();
    }
    return words;
  }

  /** 最新の試行のチームの記録 */
  entry(teamId: string): TeamAttempt | undefined {
    const attempt = this.publicState.attempts[this.publicState.attempts.length - 1];
    return attempt?.teams.find((teamEntry) => teamEntry.teamId === teamId);
  }

  points(teamId: string): number {
    return this.publicState.scores.find((score) => score.teamId === teamId)?.points ?? -1;
  }

  private apply(transition: Transition): void {
    if (transition.publicState !== undefined) {
      this.publicState = transition.publicState;
    }
    if (transition.stage !== undefined) {
      this.stage = transition.stage;
    }
    if (transition.gameSecret !== undefined) {
      this.gameSecret = transition.gameSecret;
    }
    this.deadlineSeconds = transition.deadlineSeconds;
    this.lastSecrets = transition.secrets;
    for (const [id, secret] of transition.secrets ?? []) {
      this.stored.set(id, secret as MindMeldSecret);
    }
    if (transition.result !== undefined) {
      this.result = transition.result;
      this.lifecycle = "finished";
    }
    this.verify();
  }

  rebuild(playerId: string): MindMeldSecret | undefined {
    return mindMeldModule.rebuildSecret({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
      playerId,
    });
  }

  private verify(): void {
    for (const player of this.players) {
      expect(this.rebuild(player.id), `rebuild ${player.id} at ${this.stage}`).toEqual(this.stored.get(player.id));
    }
    // 公開状態のキーを許可リストで照合する。名前を変えた漏洩もここで落ちる
    expect(Object.keys(this.publicState).sort()).toEqual([...PUBLIC_KEYS].sort());
    const state = this.publicState;
    const allAttempts = [...state.attempts, ...state.rounds.flatMap((round) => round.attempts)];
    const shapes: [string, readonly object[], string[]][] = [
      ["teams", state.teams, ["id", "label", "memberIds"]],
      ["scores", state.scores, ["points", "teamId"]],
      ["keyExpressions", state.keyExpressions, ["en", "ja"]],
      ["attempts", allAttempts, ["attemptIndex", "teams"]],
      ["teamAttempts", allAttempts.flatMap((attempt) => attempt.teams), ["claim", "exact", "matched", "near", "teamId", "words"]],
      [
        "words",
        allAttempts.flatMap((attempt) => attempt.teams.flatMap((entry) => entry.words)),
        ["playerId", "word"],
      ],
      [
        "claims",
        allAttempts.flatMap((attempt) => attempt.teams.flatMap((entry) => (entry.claim === null ? [] : [entry.claim]))),
        ["accepted", "claimedBy", "objectorIds"],
      ],
      ["rounds", state.rounds, ["attempts", "matchedAt", "prompt", "roundIndex"]],
      ["matchedAt", state.rounds.flatMap((round) => round.matchedAt), ["attempt", "teamId"]],
      ["prompts", [...(state.prompt === null ? [] : [state.prompt]), ...state.rounds.map((round) => round.prompt)], ["en", "id", "ja"]],
    ];
    for (const [name, items, keys] of shapes) {
      for (const item of items) {
        expect(Object.keys(item).sort(), name).toEqual([...keys].sort());
      }
    }

    const json = JSON.stringify(state);
    // 後のラウンドのお題は、どのステージの公開状態にも現れない。briefing では最初のお題も現れない
    const firstHidden = this.stage === STAGES.briefing ? 0 : state.roundIndex + 1;
    for (const prompt of this.gameSecret.prompts.slice(firstHidden)) {
      expect(json, `後のお題 ${prompt.id} が公開状態にある`).not.toContain(JSON.stringify(prompt.en));
    }
    // input 中は、提出した語が公開状態に現れない。終わったラウンドの記録は除いて見る
    // （次のラウンドでは同じ語を出してよく、前のラウンドの開示に同じ語が残るため）
    if (this.stage === STAGES.input) {
      const current = JSON.stringify({ ...state, rounds: [] });
      for (const word of Object.values(this.gameSecret.currentWords)) {
        expect(current, `提出した語 ${word} が公開状態にある`).not.toContain(JSON.stringify(word));
      }
    }
  }
}

/** 全チームを、それぞれ matchAt 回目（1始まり。null は一致しない）で一致させてラウンドを1つ進める */
function playRound(session: Session, matchAt: (teamId: string) => number | null): void {
  const roundIndex = session.publicState.roundIndex;
  while (session.publicState.roundIndex === roundIndex && session.stage === STAGES.input) {
    const attempt = session.publicState.attemptIndex + 1;
    for (const team of session.teams()) {
      if (session.speakers(team.id).length > 0 && session.stage === STAGES.input) {
        session.submitTeam(team.id, matchAt(team.id) === attempt);
      }
    }
    if (session.stage === STAGES.input) {
      session.deadline();
    }
    expect(session.stage).toBe(STAGES.reveal);
    session.readyAll();
  }
}

function playToEnd(session: Session, matchAt: (teamId: string, roundIndex: number) => number | null): void {
  session.readyAll();
  while (session.stage === STAGES.input) {
    const roundIndex = session.publicState.roundIndex;
    playRound(session, (teamId) => matchAt(teamId, roundIndex));
  }
}

describe("start", () => {
  it("決定性: 同じ seed と参加者から同じチームとラベルとお題が得られる", () => {
    const a = new Session(7, { seed: 99 });
    const b = new Session(7, { seed: 99 });
    expect(a.publicState.teams).toEqual(b.publicState.teams);
    expect(a.gameSecret.prompts).toEqual(b.gameSecret.prompts);
    const c = new Session(7, { seed: 100 });
    expect([c.publicState.teams, c.gameSecret.prompts]).not.toEqual([a.publicState.teams, a.gameSecret.prompts]);
  });

  it("編成: 4〜8人で sizes が表のとおりになり、全員がちょうど1つのチームに入り、A から順にラベルが付く", () => {
    expect(TEAM_SIZES).toEqual({ 4: [2, 2], 5: [2, 3], 6: [2, 2, 2], 7: [2, 2, 3], 8: [2, 2, 2, 2] });
    for (let count = 4; count <= 8; count += 1) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const session = new Session(count, { seed });
        const teams = session.publicState.teams;
        expect(teams.map((team) => team.memberIds.length).sort()).toEqual([...(TEAM_SIZES[count] ?? [])].sort());
        expect(teams.map((team) => team.label)).toEqual(["A", "B", "C", "D"].slice(0, teams.length));
        const members = teams.flatMap((team) => team.memberIds);
        expect(members.sort()).toEqual(session.players.map((player) => player.id).sort());
        // チームの中の並びは参加の順を保つ（3人組の交代の順）
        for (const team of teams) {
          const order = team.memberIds.map((id) => session.players.findIndex((player) => player.id === id));
          expect(order).toEqual([...order].sort((x, y) => x - y));
        }
        expect(session.publicState.scores).toEqual(teams.map((team) => ({ teamId: team.id, points: 0 })));
      }
    }
  });

  it("briefing から始まり、お題は MAX_ROUNDS 件を gameSecret に固定し、公開しない", () => {
    const session = new Session(4);
    expect(session.stage).toBe(STAGES.briefing);
    expect(session.deadlineSeconds).toBe(BRIEFING_SECONDS);
    expect(session.publicState.prompt).toBeNull();
    expect(session.gameSecret.prompts).toHaveLength(MAX_ROUNDS);
    expect(new Set(session.gameSecret.prompts.map((prompt) => prompt.id)).size).toBe(MAX_ROUNDS);
    expect(session.publicState.inputSeconds).toBe(INPUT_SECONDS.default);
  });

  it("秘密の配布: start で全員へ roundIndex 0 と attemptIndex 0 を送る", () => {
    const session = new Session(5);
    expect([...(session.lastSecrets ?? new Map())]).toEqual(
      session.players.map((player) => [player.id, { roundIndex: 0, attemptIndex: 0 }]),
    );
  });
});

describe("設定", () => {
  it("記述子の min / max と validateSettings の受理範囲が一致する", () => {
    const [field] = mindMeldModule.settingsFields;
    expect(field).toMatchObject({ type: "number", key: "inputSeconds", min: 20, max: 60, step: 10, default: 30 });
    if (field?.type !== "number") {
      throw new Error("数値の設定である必要がある");
    }
    expect(mindMeldModule.validateSettings({ inputSeconds: field.min }).valid).toBe(true);
    expect(mindMeldModule.validateSettings({ inputSeconds: field.max }).valid).toBe(true);
    expect(mindMeldModule.validateSettings({ inputSeconds: field.min - 1 }).valid).toBe(false);
    expect(mindMeldModule.validateSettings({ inputSeconds: field.max + 1 }).valid).toBe(false);
    // step は受理の条件にしない
    expect(mindMeldModule.validateSettings({ inputSeconds: 25 }).valid).toBe(true);
  });

  it("型違いを拒否し、欠損は既定値を使う", () => {
    expect(mindMeldModule.validateSettings({ inputSeconds: "30" }).valid).toBe(false);
    expect(mindMeldModule.validateSettings({ inputSeconds: 30.5 }).valid).toBe(false);
    expect(mindMeldModule.validateSettings("x").valid).toBe(false);
    expect(mindMeldModule.validateSettings(undefined).valid).toBe(true);
    expect(mindMeldModule.validateSettings({}).valid).toBe(true);
    expect(new Session(4, { settings: { inputSeconds: 50 } }).publicState.inputSeconds).toBe(50);
  });

  it("ロビーの記述子", () => {
    expect(mindMeldModule.title).toBe("MIND MELD");
    expect(mindMeldModule.icon).toBe("\u{1F9E0}");
    expect(mindMeldModule.playerCount).toEqual([4, 8]);
    expect(mindMeldModule.listContents()).toEqual([{ id: PACK_ID, title: "テスト用のお題" }]);
  });
});

describe("briefing から input", () => {
  it("全員の ready で最初のお題の input へ進み、usedKeys をお題の語で初期化し、全員へ秘密を送る", () => {
    const session = new Session(4);
    session.readyAll();
    expect(session.stage).toBe(STAGES.input);
    expect(session.deadlineSeconds).toBe(INPUT_SECONDS.default);
    expect(session.publicState.prompt).toEqual(session.gameSecret.prompts[0]);
    const words = (session.publicState.prompt?.en ?? "").toLowerCase().split(" ").filter((word) => word.length >= 2);
    expect(session.publicState.usedKeys).toEqual(words);
    expect(session.publicState.activePlayerIds.sort()).toEqual(session.players.map((player) => player.id).sort());
    expect(session.lastSecrets?.size).toBe(4);
  });

  it("締切でも input へ進む", () => {
    const session = new Session(4);
    session.must("p1", ACTIONS.ready);
    expect(session.stage).toBe(STAGES.briefing);
    session.deadline();
    expect(session.stage).toBe(STAGES.input);
  });

  it("ready の二重送信は冪等であり、切断した人を待たない", () => {
    const session = new Session(4);
    session.must("p1", ACTIONS.ready);
    session.must("p1", ACTIONS.ready);
    expect(session.publicState.readyPlayerIds).toEqual(["p1"]);
    session.disconnected = ["p4"];
    session.must("p2", ACTIONS.ready);
    session.must("p3", ACTIONS.ready);
    expect(session.stage).toBe(STAGES.input);
  });

  it("ステージ違い・参加者でない送信者・未知の action は invalid_stage", () => {
    const session = new Session(4);
    expect(session.submit("p1", "apple")).toBe(ERROR_CODES.invalidStage);
    expect(session.claim("p1")).toBe(ERROR_CODES.invalidStage);
    expect(session.object("p1", "a")).toBe(ERROR_CODES.invalidStage);
    expect(session.act("p9", ACTIONS.ready)).toBe(ERROR_CODES.invalidStage);
    expect(session.act("p1", "dance")).toBe(ERROR_CODES.invalidStage);
    session.readyAll();
    expect(session.act("p1", ACTIONS.ready)).toBe(ERROR_CODES.invalidStage);
    expect(session.act("p9", ACTIONS.submit, { roundIndex: 0, attemptIndex: 0, word: "apple" })).toBe(
      ERROR_CODES.invalidStage,
    );
  });
});

describe("submit", () => {
  it("正規化: 全角の英字、曲がった '、前後の記号、大文字が正規化され、保存と開示が表示形になる", () => {
    const session = new Session(4);
    session.readyAll();
    const [teamA, teamB] = session.teams();
    const [a1, a2] = session.speakers(teamA!.id);
    const [b1, b2] = session.speakers(teamB!.id);
    session.must(a1!, ACTIONS.submit, { roundIndex: 0, attemptIndex: 0, word: "  ＲＯＣＫ’Ｎ’ＲＯＬＬ!! " });
    expect(session.lastSecrets?.get(a1!)).toEqual({ roundIndex: 0, attemptIndex: 0, word: "rock'n'roll" });
    session.must(a2!, ACTIONS.submit, { roundIndex: 0, attemptIndex: 0, word: '"Rock-n-roll"' });
    expect(session.submit(b1!, "Ice Cream")).toBeUndefined();
    expect(session.submit(b2!, "icecream.")).toBeUndefined();
    expect(session.stage).toBe(STAGES.reveal);
    expect(session.entry(teamA!.id)).toMatchObject({
      words: [
        { playerId: a1, word: "rock'n'roll" },
        { playerId: a2, word: "rock-n-roll" },
      ],
      exact: true,
      near: false,
    });
    // 照合キー: ice cream と icecream は同じ照合キー
    expect(session.entry(teamB!.id)).toMatchObject({
      words: [
        { playerId: b1, word: "ice cream" },
        { playerId: b2, word: "icecream" },
      ],
      exact: true,
    });
  });

  it("invalid_word: かなを含む語、3要素以上の語、24文字を超える語、照合キーが1文字の語、文字列でない語", () => {
    const session = new Session(4);
    session.readyAll();
    for (const word of ["ねこ", "catねこ", "ice cream cone", "a".repeat(MAX_WORD_CHARS + 1), "a", "!!", 42, null]) {
      expect(session.act("p1", ACTIONS.submit, { roundIndex: 0, attemptIndex: 0, word }), String(word)).toBe(
        ERROR_CODES.invalidWord,
      );
    }
  });

  it("stale_attempt: 番号が数値でない、または現在の値と違う", () => {
    const session = new Session(4);
    session.readyAll();
    for (const payload of [
      { roundIndex: 1, attemptIndex: 0, word: "apple" },
      { roundIndex: 0, attemptIndex: 1, word: "apple" },
      { roundIndex: "0", attemptIndex: 0, word: "apple" },
      { word: "apple" },
      undefined,
    ]) {
      expect(session.act("p1", ACTIONS.submit, payload)).toBe(ERROR_CODES.staleAttempt);
    }
  });

  it("上書きを許し、最後に受理した提出が有効になる", () => {
    const session = new Session(4);
    session.readyAll();
    const [teamA] = session.teams();
    const [a1, a2] = session.speakers(teamA!.id);
    expect(session.submit(a1!, "apple")).toBeUndefined();
    expect(session.submit(a1!, "banana")).toBeUndefined();
    expect(session.publicState.submittedPlayerIds).toEqual([a1]);
    expect(session.stored.get(a1!)).toEqual({ roundIndex: 0, attemptIndex: 0, word: "banana" });
    expect(session.submit(a2!, "banana")).toBeUndefined();
    session.deadline();
    expect(session.entry(teamA!.id)?.exact).toBe(true);
  });

  it("used_word: お題の語と、同じラウンドで開示済みの語（他のペアの語を含む）を出せず、次のラウンドでは出せる", () => {
    const session = new Session(4);
    session.readyAll();
    const promptWord = (session.publicState.prompt?.en ?? "").split(" ").at(-1) ?? "";
    expect(session.submit("p1", promptWord.toUpperCase())).toBe(ERROR_CODES.usedWord);
    const [teamA, teamB] = session.teams();
    const [aWord] = session.submitTeam(teamA!.id, false);
    const [bWord] = session.submitTeam(teamB!.id, false);
    expect(session.stage).toBe(STAGES.reveal);
    session.readyAll();
    expect(session.publicState.attemptIndex).toBe(1);
    expect(session.publicState.usedKeys).toEqual(expect.arrayContaining([aWord, bWord]));
    const [b1] = session.speakers(teamB!.id);
    // 他のペアが前の試行で出した語も禁止する
    expect(session.submit(b1!, aWord.toUpperCase())).toBe(ERROR_CODES.usedWord);
    expect(session.submit(b1!, bWord)).toBe(ERROR_CODES.usedWord);

    // ラウンドを終えれば、同じ語を出せる
    playRound(session, () => null);
    expect(session.publicState.roundIndex).toBe(1);
    expect(session.publicState.attemptIndex).toBe(0);
    expect(session.publicState.usedKeys).not.toContain(aWord);
    expect(session.submit(b1!, aWord)).toBeUndefined();
  });

  it("not_active: 一致済みのペアと、休む3人組の1人は語を出せない", () => {
    const session = new Session(5);
    session.readyAll();
    const trio = session.trio()!;
    const pair = session.teams().find((team) => team.memberIds.length === 2)!;
    const resting = trio.memberIds.find((playerId) => !session.publicState.activePlayerIds.includes(playerId));
    expect(resting).toBeDefined();
    expect(session.submit(resting!, "apple")).toBe(ERROR_CODES.notActive);

    session.submitTeam(pair.id, true);
    session.submitTeam(trio.id, false);
    expect(session.stage).toBe(STAGES.reveal);
    session.readyAll();
    expect(session.publicState.attemptIndex).toBe(1);
    for (const playerId of pair.memberIds) {
      expect(session.submit(playerId, "zebra")).toBe(ERROR_CODES.notActive);
    }
  });

  it("ペイロード: 24文字の語と番号を持つ submit のペイロードが ACTION_MAX_CHARS 未満", () => {
    const payload = { roundIndex: MAX_ROUNDS - 1, attemptIndex: MAX_ATTEMPTS - 1, word: "a".repeat(MAX_WORD_CHARS) };
    expect(JSON.stringify(payload).length).toBeLessThan(ACTION_MAX_CHARS);
  });
});

describe("input から reveal", () => {
  it("語を出す人のうち接続中の全員の提出で reveal へ進み、切断した人を待たない。最後の提出の本人の秘密も載る", () => {
    const session = new Session(4);
    session.readyAll();
    const [teamA, teamB] = session.teams();
    const [a1, a2] = session.speakers(teamA!.id);
    const [b1, b2] = session.speakers(teamB!.id);
    session.disconnected = [b2!];
    expect(session.submit(a1!, "apple")).toBeUndefined();
    expect(session.lastSecrets?.size).toBe(1);
    expect(session.submit(a2!, "apple")).toBeUndefined();
    expect(session.stage).toBe(STAGES.input);
    expect(session.submit(b1!, "banana")).toBeUndefined();
    expect(session.stage).toBe(STAGES.reveal);
    expect(session.deadlineSeconds).toBe(REVEAL_SECONDS);
    expect([...(session.lastSecrets ?? new Map())]).toEqual([[b1, { roundIndex: 0, attemptIndex: 0, word: "banana" }]]);
    // ペアの相手が切断したままだと、残った1人が語を出しても一致しない
    expect(session.entry(teamB!.id)).toMatchObject({ words: [{ word: "banana" }, { word: null }], exact: false, near: false });
    expect(session.entry(teamA!.id)?.exact).toBe(true);
  });

  it("締切で未提出の人がいるペアは一致せず、申告もできない", () => {
    const session = new Session(4);
    session.readyAll();
    const [teamA] = session.teams();
    const [a1, a2] = session.speakers(teamA!.id);
    expect(session.submit(a1!, "apple")).toBeUndefined();
    session.deadline();
    expect(session.stage).toBe(STAGES.reveal);
    expect(session.lastSecrets).toBeUndefined();
    expect(session.entry(teamA!.id)).toMatchObject({ words: [{ word: "apple" }, { word: null }], exact: false, near: false });
    expect(session.claim(a2!)).toBe(ERROR_CODES.notClaimable);
    session.readyAll();
    expect(session.publicState.rounds).toEqual([]);
    expect(session.publicState.attempts[0]?.teams.find((entry) => entry.teamId === teamA!.id)?.matched).toBe(false);
  });

  it("秘密の配布: 次の試行の input へ入ると全員へ番号だけの秘密を送り、前の試行の語を消す", () => {
    const session = new Session(5);
    session.readyAll();
    for (const team of session.teams()) {
      session.submitTeam(team.id, false);
    }
    expect(session.stage).toBe(STAGES.reveal);
    session.readyAll();
    expect(session.stage).toBe(STAGES.input);
    expect([...(session.lastSecrets ?? new Map())]).toEqual(
      session.players.map((player) => [player.id, { roundIndex: 0, attemptIndex: 1 }]),
    );
  });
});

/** 4人で、teamA の2語を与えて reveal まで進める。teamB は一致しない語を出す */
function revealWith(words: [string, string], count = 4): { session: Session; teamA: TeamPublic; teamB: TeamPublic } {
  const session = new Session(count);
  session.readyAll();
  const [teamA, teamB] = session.teams();
  const [a1, a2] = session.speakers(teamA!.id);
  expect(session.submit(a1!, words[0])).toBeUndefined();
  expect(session.submit(a2!, words[1])).toBeUndefined();
  for (const team of session.teams().slice(1)) {
    session.submitTeam(team.id, false);
  }
  expect(session.stage).toBe(STAGES.reveal);
  return { session, teamA: teamA!, teamB: teamB! };
}

describe("claim", () => {
  it("近い語のペアだけが申告でき、初回の受理で締切が置き直され ready が解除される。2回目は状態を変えない", () => {
    const { session, teamA, teamB } = revealWith(["apple", "apples"]);
    expect(session.entry(teamA.id)).toMatchObject({ exact: false, near: true, claim: null });
    // 近い語でないペアは申告できない
    expect(session.claim(teamB.memberIds[0]!)).toBe(ERROR_CODES.notClaimable);

    session.must(teamB.memberIds[0]!, ACTIONS.ready);
    session.must(teamA.memberIds[1]!, ACTIONS.ready);
    expect(session.publicState.readyPlayerIds).toHaveLength(2);
    expect(session.claim(teamA.memberIds[0]!)).toBeUndefined();
    expect(session.deadlineSeconds).toBe(REVEAL_SECONDS);
    expect(session.publicState.readyPlayerIds).toEqual([]);
    expect(session.entry(teamA.id)?.claim).toEqual({ claimedBy: teamA.memberIds[0], objectorIds: [], accepted: null });

    session.must(teamB.memberIds[0]!, ACTIONS.ready);
    const before = session.publicState;
    expect(session.claim(teamA.memberIds[1]!)).toBeUndefined();
    expect(session.publicState).toEqual(before);
    expect(session.deadlineSeconds).toBeUndefined();
    expect(session.publicState.readyPlayerIds).toEqual([teamB.memberIds[0]]);
  });

  it("stale_attempt: 番号が違う申告と異議", () => {
    const { session, teamA, teamB } = revealWith(["apple", "apples"]);
    expect(session.act(teamA.memberIds[0]!, ACTIONS.claim, { roundIndex: 0, attemptIndex: 1 })).toBe(
      ERROR_CODES.staleAttempt,
    );
    expect(session.act(teamA.memberIds[0]!, ACTIONS.claim, {})).toBe(ERROR_CODES.staleAttempt);
    session.must(teamA.memberIds[0]!, ACTIONS.claim, { roundIndex: 0, attemptIndex: 0 });
    expect(
      session.act(teamB.memberIds[0]!, ACTIONS.object, { roundIndex: 1, attemptIndex: 0, teamId: teamA.id, objecting: true }),
    ).toBe(ERROR_CODES.staleAttempt);
  });

  it("完全一致のペアは申告できない", () => {
    const { session, teamA } = revealWith(["apple", "APPLE"]);
    expect(session.claim(teamA.memberIds[0]!)).toBe(ERROR_CODES.notClaimable);
  });

  it("3人組の休んだ1人も自分のチームの申告を送れる", () => {
    const session = new Session(5);
    session.readyAll();
    const trio = session.trio()!;
    const [s1, s2] = session.speakers(trio.id);
    const resting = trio.memberIds.find((id) => id !== s1 && id !== s2)!;
    expect(session.submit(s1!, "child")).toBeUndefined();
    expect(session.submit(s2!, "children")).toBeUndefined();
    const pair = session.teams().find((team) => team.id !== trio.id)!;
    session.submitTeam(pair.id, false);
    expect(session.claim(resting)).toBeUndefined();
    expect(session.entry(trio.id)?.claim?.claimedBy).toBe(resting);
  });
});

describe("object", () => {
  it("申告したチームの人と、申告の無いチームへの異議と、真偽値でない objecting は invalid_objection", () => {
    const { session, teamA, teamB } = revealWith(["color", "colour"]);
    session.must(teamA.memberIds[0]!, ACTIONS.claim, { roundIndex: 0, attemptIndex: 0 });
    expect(session.object(teamA.memberIds[1]!, teamA.id)).toBe(ERROR_CODES.invalidObjection);
    expect(session.object(teamA.memberIds[0]!, teamB.id)).toBe(ERROR_CODES.invalidObjection);
    expect(session.object(teamB.memberIds[0]!, "zz")).toBe(ERROR_CODES.invalidObjection);
    expect(
      session.act(teamB.memberIds[0]!, ACTIONS.object, { roundIndex: 0, attemptIndex: 0, teamId: teamA.id, objecting: "yes" }),
    ).toBe(ERROR_CODES.invalidObjection);
  });

  it("異議は1人1件で、取り下げで消える。ready は解除しない", () => {
    const { session, teamA, teamB } = revealWith(["color", "colour"]);
    session.must(teamA.memberIds[0]!, ACTIONS.claim, { roundIndex: 0, attemptIndex: 0 });
    session.must(teamA.memberIds[0]!, ACTIONS.ready);
    expect(session.object(teamB.memberIds[0]!, teamA.id)).toBeUndefined();
    expect(session.object(teamB.memberIds[0]!, teamA.id)).toBeUndefined();
    expect(session.entry(teamA.id)?.claim?.objectorIds).toEqual([teamB.memberIds[0]]);
    expect(session.publicState.readyPlayerIds).toEqual([teamA.memberIds[0]]);
    expect(session.object(teamB.memberIds[0]!, teamA.id, false)).toBeUndefined();
    expect(session.entry(teamA.id)?.claim?.objectorIds).toEqual([]);
  });
});

describe("判定", () => {
  /** 8人で teamA が近い語を申告し、objectors の人数が異議を出した状態で reveal を締切で終える */
  function judge(objectorCount: number, disconnect: (session: Session, teamA: TeamPublic) => void = () => {}) {
    const { session, teamA } = revealWith(["knife", "knives"], 8);
    session.must(teamA.memberIds[0]!, ACTIONS.claim, { roundIndex: 0, attemptIndex: 0 });
    const judges = session.players.map((player) => player.id).filter((id) => !teamA.memberIds.includes(id));
    for (const judgeId of judges.slice(0, objectorCount)) {
      expect(session.object(judgeId, teamA.id)).toBeUndefined();
    }
    disconnect(session, teamA);
    session.deadline();
    const record = session.publicState.attempts[0]?.teams.find((entry) => entry.teamId === teamA.id);
    return { session, teamA, judges, record };
  }

  it("判定者6人で、異議4人（過半数）なら退け、3人（半数ちょうど）なら認める", () => {
    const rejected = judge(4);
    expect(rejected.record?.claim?.accepted).toBe(false);
    expect(rejected.record?.matched).toBe(false);
    expect(rejected.session.points(rejected.teamA.id)).toBe(0);

    const accepted = judge(3);
    expect(accepted.record?.claim?.accepted).toBe(true);
    expect(accepted.record?.matched).toBe(true);
    // 申告が認められた一致も、完全一致と同じ点になる
    expect(accepted.session.points(accepted.teamA.id)).toBe(MAX_ATTEMPTS);
  });

  it("4人の卓では判定者2人のうち1人の異議では退けられず、2人で退ける", () => {
    for (const [objectors, accepted] of [
      [1, true],
      [2, false],
    ] as const) {
      const { session, teamA, teamB } = revealWith(["apple", "apples"]);
      session.must(teamA.memberIds[0]!, ACTIONS.claim, { roundIndex: 0, attemptIndex: 0 });
      for (const judgeId of teamB.memberIds.slice(0, objectors)) {
        expect(session.object(judgeId, teamA.id)).toBeUndefined();
      }
      session.readyAll();
      expect(session.publicState.attempts[0]?.teams.find((entry) => entry.teamId === teamA.id)?.claim?.accepted).toBe(
        accepted,
      );
    }
  });

  it("切断した人の異議と判定者を数えない", () => {
    // 異議4人のうち2人が切断すると、判定者4人に対し異議2人で認める
    const result = judge(4, (session, teamA) => {
      const judges = session.players.map((player) => player.id).filter((id) => !teamA.memberIds.includes(id));
      session.disconnected = judges.slice(0, 2);
    });
    expect(result.record?.claim?.accepted).toBe(true);
    // 異議を出していない判定者が切断すると、判定者3人に対し異議2人で退ける
    const narrowed = judge(2, (session, teamA) => {
      const judges = session.players.map((player) => player.id).filter((id) => !teamA.memberIds.includes(id));
      session.disconnected = judges.slice(2, 5);
    });
    expect(narrowed.record?.claim?.accepted).toBe(false);
    // 異議の記録は切断した人の分も残る（誰が異議を出したかを場で振り返れるようにする）
    expect(narrowed.record?.claim?.objectorIds).toHaveLength(2);
  });

  it("判定者が0人なら申告を認める", () => {
    const result = judge(4, (session, teamA) => {
      session.disconnected = session.players.map((player) => player.id).filter((id) => !teamA.memberIds.includes(id));
    });
    expect(result.record?.claim?.accepted).toBe(true);
  });
});

describe("得点とラウンドの終わり", () => {
  it("1〜4回目の一致で4〜1点、一致しなければ0点", () => {
    const session = new Session(8);
    session.readyAll();
    const order = session.teams().map((team) => team.id);
    // A は1回目、B は2回目、C は3回目、D は一致しない
    playRound(session, (teamId) => [1, 2, 3, null][order.indexOf(teamId)] ?? null);
    expect(session.publicState.roundIndex).toBe(1);
    expect(session.publicState.scores.map((score) => score.points)).toEqual([4, 3, 2, 0]);
    expect(session.publicState.rounds[0]?.attempts).toHaveLength(MAX_ATTEMPTS);
    expect(session.publicState.rounds[0]?.matchedAt).toEqual(
      order.map((teamId, index) => ({ teamId, attempt: [1, 2, 3, null][index] })),
    );

    // 4回目の一致は1点
    playRound(session, (teamId) => (teamId === order[3] ? 4 : null));
    expect(session.publicState.scores.map((score) => score.points)).toEqual([4, 3, 2, 1]);
  });

  it("全チームの一致で試行の途中でも次のラウンドへ進み、usedKeys と attempts を空から作り直す", () => {
    const session = new Session(6);
    session.readyAll();
    playRound(session, () => 2);
    expect(session.publicState.roundIndex).toBe(1);
    expect(session.publicState.attemptIndex).toBe(0);
    expect(session.publicState.attempts).toEqual([]);
    expect(session.publicState.rounds[0]?.attempts).toHaveLength(2);
    expect(session.publicState.prompt).toEqual(session.gameSecret.prompts[1]);
    expect(session.publicState.activePlayerIds).toHaveLength(6);
  });

  it("4回目の試行の後は一致の有無にかかわらず次のラウンドへ進む", () => {
    const session = new Session(4);
    session.readyAll();
    playRound(session, () => null);
    expect(session.publicState.roundIndex).toBe(1);
    expect(session.publicState.rounds[0]?.attempts).toHaveLength(MAX_ATTEMPTS);
  });

  it("一致したチームはラウンドの残りの試行で語を出さない", () => {
    const session = new Session(4);
    session.readyAll();
    const [teamA, teamB] = session.teams();
    session.submitTeam(teamA!.id, true);
    session.submitTeam(teamB!.id, false);
    session.readyAll();
    expect(session.publicState.activePlayerIds.sort()).toEqual([...teamB!.memberIds].sort());
    expect(session.stored.get(teamA!.memberIds[0]!)).toEqual({ roundIndex: 0, attemptIndex: 1 });
  });
});

describe("3人組", () => {
  it("交代が (P, Q)、(Q, R)、(R, P) の順に進み、ラウンドをまたいで続き、一致済みの試行では進まない", () => {
    const session = new Session(5);
    const trio = session.trio()!;
    const [p, q, r] = trio.memberIds;
    const pair = session.teams().find((team) => team.id !== trio.id)!;
    session.readyAll();
    const seen: string[][] = [];
    const record = () => seen.push(session.speakers(trio.id));

    // ラウンド1: 3人組は2回目で一致する。ペアは一致しない
    record();
    session.submitTeam(trio.id, false);
    session.submitTeam(pair.id, false);
    session.readyAll();
    record();
    session.submitTeam(trio.id, true);
    session.submitTeam(pair.id, false);
    session.readyAll();
    // 3人組が一致済みの試行では交代が進まない
    expect(session.speakers(trio.id)).toEqual([]);
    expect(session.gameSecret.trioTurns).toBe(2);
    session.submitTeam(pair.id, false);
    session.readyAll();
    session.submitTeam(pair.id, false);
    session.readyAll();

    // ラウンド2: 数えはラウンドをまたいで続く
    expect(session.publicState.roundIndex).toBe(1);
    record();
    session.submitTeam(trio.id, false);
    session.submitTeam(pair.id, false);
    session.readyAll();
    record();
    expect(seen).toEqual([
      [p, q],
      [q, r],
      [r, p],
      [p, q],
    ]);
  });
});

describe("結果", () => {
  it("同点のチームが同じ順位になり、全ラウンドの語と申告と異議の記録が載る", () => {
    const session = new Session(6);
    session.readyAll();
    const [teamA, teamB, teamC] = session.teams();

    // ラウンド1: A は近い語を申告し、C の1人が異議を出す（判定者4人に異議1人で認める）
    const [a1, a2] = session.speakers(teamA!.id);
    expect(session.submit(a1!, "theater")).toBeUndefined();
    expect(session.submit(a2!, "theatre")).toBeUndefined();
    session.submitTeam(teamB!.id, true);
    session.submitTeam(teamC!.id, false);
    session.must(a1!, ACTIONS.claim, { roundIndex: 0, attemptIndex: 0 });
    expect(session.object(teamC!.memberIds[0]!, teamA!.id)).toBeUndefined();
    session.readyAll();
    playRound(session, () => null);
    // 残りのラウンドは A と B が同じ回で一致し、C は一致しない
    while (session.stage === STAGES.input) {
      playRound(session, (teamId) => (teamId === teamC!.id ? null : 1));
    }

    expect(session.stage).toBe(STAGES.debrief);
    const result = session.result!;
    expect(result.playerCount).toBe(6);
    expect(result.standings).toEqual([
      { teamId: teamA!.id, points: 16, place: 1, matchedCount: 4 },
      { teamId: teamB!.id, points: 16, place: 1, matchedCount: 4 },
      { teamId: teamC!.id, points: 0, place: 3, matchedCount: 0 },
    ]);
    expect(result.rounds).toHaveLength(MAX_ROUNDS);
    expect(result.rounds.map((round) => round.prompt)).toEqual(session.gameSecret.prompts);
    const first = result.rounds[0]!.attempts[0]!.teams.find((entry) => entry.teamId === teamA!.id)!;
    expect(first.words.map((word) => word.word)).toEqual(["theater", "theatre"]);
    expect(first.claim).toEqual({ claimedBy: a1, objectorIds: [teamC!.memberIds[0]], accepted: true });
    expect(result.teams).toEqual(session.publicState.teams);
  });
});

describe("rebuildSecret", () => {
  it("gameSecret が無いときと参加者でないときに例外を投げる", () => {
    const session = new Session(4);
    expect(() =>
      mindMeldModule.rebuildSecret({
        room: session.room(),
        publicState: session.publicState,
        gameSecret: undefined,
        playerId: "p1",
      }),
    ).toThrow();
    expect(() => session.rebuild("p9")).toThrow();
  });

  it("遷移が返した秘密を溜めた値と、提出の上書き・締切・申告・ラウンドの切り替え・終局の各遷移の直後に一致する", () => {
    // 一致の確認は Session.verify が遷移ごとに全員について行う。ここは経路を通すだけでよい
    for (const count of [4, 5, 8]) {
      const session = new Session(count, { seed: count });
      session.readyAll();
      const [teamA, teamB] = session.teams();
      const [a1, a2] = session.speakers(teamA!.id);
      expect(session.submit(a1!, "apple")).toBeUndefined();
      expect(session.submit(a1!, "bus")).toBeUndefined();
      expect(session.submit(a2!, "buses")).toBeUndefined();
      session.submitTeam(teamB!.id, false);
      if (session.stage === STAGES.input) {
        session.deadline();
      }
      session.must(a2!, ACTIONS.claim, { roundIndex: 0, attemptIndex: 0 });
      session.deadline();
      // 終局まで、締切と ready の両方の経路を混ぜて進める
      let toggle = false;
      while (session.stage !== STAGES.debrief) {
        if (session.stage === STAGES.input) {
          for (const team of session.teams()) {
            if (session.speakers(team.id).length > 0 && session.stage === STAGES.input) {
              session.submitTeam(team.id, toggle);
            }
          }
          if (session.stage === STAGES.input) {
            session.deadline();
          }
        } else {
          toggle = !toggle;
          if (toggle) {
            session.deadline();
          } else {
            session.readyAll();
          }
        }
      }
      expect(session.lifecycle).toBe("finished");
      expect(session.result).toBeDefined();
    }
  });
});

describe("人数", () => {
  for (const count of [4, 5, 6, 7, 8]) {
    it(`${count}人で開始から debrief まで進む`, () => {
      const session = new Session(count, { seed: 7 * count });
      const order = session.teams().map((team) => team.id);
      playToEnd(session, (teamId, roundIndex) => ((order.indexOf(teamId) + roundIndex) % 5) + 1 || null);
      expect(session.stage).toBe(STAGES.debrief);
      expect(session.result?.rounds).toHaveLength(MAX_ROUNDS);
      expect(session.result?.standings).toHaveLength(order.length);
      expect(session.result?.playerCount).toBe(count);
      // debrief では roundIndex を最後のラウンドのまま残す
      expect(session.publicState.roundIndex).toBe(MAX_ROUNDS - 1);
    });
  }
});
