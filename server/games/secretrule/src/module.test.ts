// GameModuleの振る舞い。Durable Objectなしで全項目を確かめる（基本設計/14のテスト観点）。
//
// Session が共通コアの代わりに状態を持ち、遷移のたびに次の2つを確かめる。
// - 遷移が返した秘密を上書きで溜めた値と、rebuildSecret の戻り値が全員について一致すること（ADR-0029）
// - 公開状態に判定の成否と秘密の規則が現れないこと（ADR-0003、ADR-0031）
import { ACTION_MAX_CHARS, type GameTransition, type Player, type Room } from "@beb/shared-core";
import {
  ACTIONS,
  CANDIDATE_COUNT,
  ERROR_CODES,
  MAX_CHARS,
  MAX_ROUNDS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  WRITING_SECONDS,
  normalizeSubmission,
  type SecretRulePublic,
  type SecretRuleResult,
  type SecretRuleSecret,
} from "@beb/shared-secretrule";
import { describe, expect, it, vi } from "vitest";
import { CORPUS, readCorpus } from "./corpus";
import type { SecretRuleGameSecret } from "./module";
import { comparisonKeyOf, satisfies } from "./rules";
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

const { secretRuleModule } = await import("./module");

const PACK_ID = "fixture_pack";
const SEED = 4242;

type Transition = GameTransition<SecretRulePublic, SecretRuleResult, SecretRuleGameSecret>;

/** 英文の在庫。収録の文例集と、規則の境界を突く文を合わせる */
const BANK: string[] = [
  ...(readCorpus(CORPUS)?.sentences ?? []),
  "Today a big dog ran far away from us.",
  "Can a cat run?",
  "Tom and Ann sang a song.",
  "Two cats sat on a mat.",
  "This cat is not big at all.",
  "Do you want a hot dog?",
  "I am a fan of jazz.",
  "Basketball is a fun sport for us.",
];

/** 共通コアの代わりに状態を持つ。secrets は上書きで溜め、result が返ったら finished にする */
class Session {
  readonly players: Player[];
  lifecycle: Room["lifecycle"] = "playing";
  stage: string;
  publicState: SecretRulePublic;
  gameSecret: SecretRuleGameSecret;
  deadlineSeconds: number | undefined;
  readonly stored = new Map<string, SecretRuleSecret>();
  result: SecretRuleResult | undefined;
  disconnected: string[] = [];
  /** 使った英文の比較キー。在庫から重複しない英文を選ぶために持つ */
  private readonly used = new Set<string>();

  constructor(playerCount: number, input: { seed?: number; settings?: unknown } = {}) {
    this.players = playersOf(playerCount);
    const started = secretRuleModule.start({
      players: this.players,
      contentId: PACK_ID,
      settings: input.settings ?? {},
      seed: input.seed ?? SEED,
    });
    this.stage = started.stage;
    this.deadlineSeconds = started.deadlineSeconds;
    this.publicState = started.publicState;
    this.gameSecret = started.gameSecret as SecretRuleGameSecret;
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
    const transition = secretRuleModule.handleAction({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
      playerId,
      action,
      payload,
    });
    if (transition.reject !== undefined) {
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
      secretRuleModule.onDeadline({ room: this.room(), publicState: this.publicState, gameSecret: this.gameSecret }),
    );
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
    for (const [id, secret] of transition.secrets ?? []) {
      this.stored.set(id, secret as SecretRuleSecret);
    }
    if (transition.result !== undefined) {
      this.result = transition.result;
      this.lifecycle = "finished";
    }
    this.verify();
  }

  rebuild(playerId: string): SecretRuleSecret | undefined {
    return secretRuleModule.rebuildSecret({
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
    const text = JSON.stringify(this.publicState);
    expect(text).not.toContain('"passed"');
    expect(text).not.toContain("ruleCandidateId");
    if (this.stage !== STAGES.proving && this.stage !== STAGES.debrief) {
      expect(this.publicState.solvedCandidateId).toBeNull();
      expect(this.publicState.avoidCandidateId).toBeNull();
    }
  }

  ids(): string[] {
    return this.players.map((player) => player.id);
  }

  connected(): string[] {
    return this.ids().filter((id) => !this.disconnected.includes(id));
  }

  readyAll(): void {
    for (const id of this.connected()) {
      this.must(id, ACTIONS.ready);
    }
  }

  /** 規則の判定が条件を満たす未使用の英文を在庫から選ぶ */
  sentence(predicate: (normalized: string) => boolean): string {
    for (const raw of BANK) {
      const normalized = normalizeSubmission(raw);
      const key = comparisonKeyOf(normalized);
      if (!this.used.has(key) && predicate(normalized)) {
        this.used.add(key);
        return raw;
      }
    }
    throw new Error("条件を満たす英文が在庫に無い");
  }

  ruleSpec() {
    const spec = this.gameSecret.rules[this.gameSecret.ruleCandidateId];
    if (spec === undefined) {
      throw new Error("秘密の規則が無い");
    }
    return spec;
  }

  avoidSpec() {
    const spec = this.gameSecret.rules[this.gameSecret.avoidCandidateId];
    if (spec === undefined) {
      throw new Error("避ける候補が無い");
    }
    return spec;
  }

  passing(): string {
    return this.sentence((text) => satisfies(this.ruleSpec(), text));
  }

  failing(): string {
    return this.sentence((text) => !satisfies(this.ruleSpec(), text));
  }

  /** writing で全員が提出する */
  submitAll(texts?: Record<string, string>): void {
    for (const id of this.connected()) {
      this.must(id, ACTIONS.submit, { text: texts?.[id] ?? this.passing() });
    }
  }

  wrongCandidate(): string {
    const wrong = this.publicState.answers.filter((answer) => !answer.correct).map((answer) => answer.candidateId);
    const candidate = this.publicState.candidates.find(
      (entry) => entry.id !== this.gameSecret.ruleCandidateId && !wrong.includes(entry.id),
    );
    if (candidate === undefined) {
      throw new Error("誤答に使える候補が無い");
    }
    return candidate.id;
  }

  selectAll(candidateId: string): void {
    for (const id of this.connected()) {
      this.must(id, ACTIONS.select, { roundIndex: this.publicState.roundIndex, candidateId });
    }
  }

  /** writing から checking まで進める。3人以上は choosing を印なしで締切まで進める */
  toChecking(): void {
    this.submitAll();
    if (this.stage === STAGES.choosing) {
      this.deadline();
    }
    expect(this.stage).toBe(STAGES.checking);
  }
}

function startedAt(stage: string, session: Session): Session {
  if (stage === STAGES.briefing) {
    return session;
  }
  session.readyAll();
  return session;
}

describe("start", () => {
  it("決定性: 同じ seed と参加者から、同じ候補・秘密の規則・避ける候補・当番順が得られる", () => {
    const a = new Session(4);
    const b = new Session(4);
    expect(a.publicState.candidates).toEqual(b.publicState.candidates);
    expect(a.gameSecret).toEqual(b.gameSecret);
  });

  it("候補6件を公開し、briefing の締切と初期の秘密を全員へ送る", () => {
    const session = new Session(3);
    expect(session.stage).toBe(STAGES.briefing);
    expect(session.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.briefing);
    expect(session.publicState.candidates).toHaveLength(CANDIDATE_COUNT);
    expect(session.publicState.maxRounds).toBe(MAX_ROUNDS);
    for (const id of session.ids()) {
      expect(session.stored.get(id)).toEqual({ phase: "briefing", roundIndex: 0, results: [] });
    }
  });

  it("言い回しの穴をパラメータで置き換える", () => {
    const session = new Session(2);
    for (const candidate of session.publicState.candidates) {
      expect(candidate.textEn).not.toMatch(/\{(n|words|letter|mark)\}/u);
      expect(candidate.textJa).not.toMatch(/\{(n|words|letter|mark)\}/u);
    }
  });

  it("抽選: 多数の seed で、秘密の規則が6件のどの位置にも現れ、避ける候補と一致しない", () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 300; seed += 1) {
      const session = new Session(2, { seed });
      const { ruleCandidateId, avoidCandidateId } = session.gameSecret;
      expect(avoidCandidateId).not.toBe(ruleCandidateId);
      positions.add(session.publicState.candidates.findIndex((entry) => entry.id === ruleCandidateId));
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("listContents は候補を含まない", () => {
    expect(secretRuleModule.listContents()).toEqual([{ id: PACK_ID, title: "テスト用の規則" }]);
  });
});

describe("設定", () => {
  it("記述子の min / max と validateSettings の受理範囲が一致する", () => {
    const field = secretRuleModule.settingsFields[0];
    expect(field).toMatchObject({ key: "writingSeconds", min: WRITING_SECONDS.min, max: WRITING_SECONDS.max });
    expect(secretRuleModule.validateSettings({ writingSeconds: WRITING_SECONDS.min }).valid).toBe(true);
    expect(secretRuleModule.validateSettings({ writingSeconds: WRITING_SECONDS.max }).valid).toBe(true);
    expect(secretRuleModule.validateSettings({ writingSeconds: WRITING_SECONDS.min - 1 }).valid).toBe(false);
    expect(secretRuleModule.validateSettings({ writingSeconds: WRITING_SECONDS.max + 1 }).valid).toBe(false);
    expect(secretRuleModule.validateSettings({ writingSeconds: 50.5 }).valid).toBe(false);
    expect(secretRuleModule.validateSettings(undefined).valid).toBe(true);
    expect(secretRuleModule.validateSettings({}).valid).toBe(true);
  });

  it("writingSeconds が writing の締切になる", () => {
    const session = startedAt(STAGES.writing, new Session(2, { settings: { writingSeconds: 90 } }));
    expect(session.stage).toBe(STAGES.writing);
    expect(session.deadlineSeconds).toBe(90);
  });
});

describe("submit", () => {
  it("3語未満、140文字超、文字列でない値を拒否する。語数と文字数は正規化後に数える", () => {
    const session = startedAt(STAGES.writing, new Session(2));
    expect(session.act("p1", ACTIONS.submit, { text: "Hi there" })).toBe(ERROR_CODES.tooShort);
    expect(session.act("p1", ACTIONS.submit, { text: "Hi there ! !" })).toBe(ERROR_CODES.tooShort);
    expect(session.act("p1", ACTIONS.submit, { text: `I like ${"a".repeat(MAX_CHARS)}` })).toBe(ERROR_CODES.tooLong);
    expect(session.act("p1", ACTIONS.submit, { text: 42 })).toBe(ERROR_CODES.invalidSubmission);
    expect(session.act("p1", ACTIONS.submit, undefined)).toBe(ERROR_CODES.invalidSubmission);
    expect(session.act("p1", ACTIONS.submit, { text: "Do　you  like cats？" })).toBeUndefined();
    expect(session.stored.get("p1")?.draft).toBe("Do you like cats?");
  });

  it("上書きを受理し、受理のたびに本人へ draft を含む秘密を返す。他人の秘密は変わらない", () => {
    const session = startedAt(STAGES.writing, new Session(3));
    const before = session.stored.get("p2");
    session.must("p1", ACTIONS.submit, { text: "I like big cats." });
    session.must("p1", ACTIONS.submit, { text: "We like big dogs." });
    expect(session.stored.get("p1")?.draft).toBe("We like big dogs.");
    expect(session.stored.get("p2")).toEqual(before);
  });

  it("同じステージで他人と比較キーが同じ英文を拒否する。本人の再送は上書きとして受理する", () => {
    const session = startedAt(STAGES.writing, new Session(3));
    session.must("p1", ACTIONS.submit, { text: "I like cats." });
    expect(session.act("p2", ACTIONS.submit, { text: "i like CATS" })).toBe(ERROR_CODES.duplicate);
    expect(session.act("p1", ACTIONS.submit, { text: "I like cats!" })).toBeUndefined();
    expect(session.act("p1", ACTIONS.submit, { text: "I like cats" })).toBeUndefined();
  });

  it("判定にかけた過去の英文と、句点・大小・全角だけが違う英文を拒否する", () => {
    const session = startedAt(STAGES.writing, new Session(2));
    session.submitAll({ p1: "I like cats.", p2: "We have two dogs." });
    session.readyAll();
    expect(session.stage).toBe(STAGES.writing);
    expect(session.act("p1", ACTIONS.submit, { text: "ｉ like cats" })).toBe(ERROR_CODES.duplicate);
    expect(session.act("p2", ACTIONS.submit, { text: "WE HAVE TWO DOGS" })).toBe(ERROR_CODES.duplicate);
  });

  it("判定にかからなかった前のラウンドの下書きは、もう一度出せる", () => {
    const session = startedAt(STAGES.writing, new Session(3));
    session.submitAll({ p1: "I like cats.", p2: "We have two dogs.", p3: "Tom runs very fast." });
    expect(session.stage).toBe(STAGES.choosing);
    session.deadline();
    const tested = session.publicState.entries.map((entry) => entry.text);
    const untested = ["I like cats.", "We have two dogs.", "Tom runs very fast."].find((text) => !tested.includes(text));
    session.readyAll();
    const author = ["p1", "p2", "p3"].find((_, index) => ["I like cats.", "We have two dogs.", "Tom runs very fast."][index] === untested);
    expect(session.act(author ?? "p1", ACTIONS.submit, { text: untested })).toBeUndefined();
  });

  it("ステージ違いは invalid_stage", () => {
    const session = new Session(2);
    expect(session.act("p1", ACTIONS.submit, { text: "I like cats." })).toBe(ERROR_CODES.invalidStage);
    expect(session.act("nobody", ACTIONS.ready)).toBe(ERROR_CODES.invalidStage);
    expect(session.act("p1", "unknown")).toBe(ERROR_CODES.invalidStage);
  });

  it("140文字の英字だけの submit のペイロードが ACTION_MAX_CHARS 未満である", () => {
    expect(JSON.stringify({ text: "a".repeat(MAX_CHARS) }).length).toBeLessThan(ACTION_MAX_CHARS);
  });
});

describe("下書きの選択", () => {
  it("2人の卓は choosing を飛ばし、2人の下書きをそのまま判定する", () => {
    const session = startedAt(STAGES.writing, new Session(2));
    session.submitAll();
    expect(session.stage).toBe(STAGES.checking);
    expect(session.publicState.entries).toHaveLength(2);
    expect(session.publicState.drafts).toHaveLength(2);
  });

  it("3件以上なら choosing へ進み、印の多い順に2件、同数は当番順で選ぶ", () => {
    const session = startedAt(STAGES.writing, new Session(4));
    session.submitAll();
    expect(session.stage).toBe(STAGES.choosing);
    expect(session.publicState.drafts).toHaveLength(4);
    const turn = session.gameSecret.turnOrder;
    const last = turn[3] as string;
    const third = turn[2] as string;
    // 当番順の最後の人の下書きに2つ、3番目に1つ印を付ける
    session.must("p1", ACTIONS.mark, { roundIndex: 0, draftPlayerIds: [last] });
    session.must("p2", ACTIONS.mark, { roundIndex: 0, draftPlayerIds: [last, third] });
    session.readyAll();
    expect(session.stage).toBe(STAGES.checking);
    expect(session.publicState.entries.map((entry) => entry.playerId)).toEqual([last, third]);
  });

  it("印が無いときは当番順で2件を選び、当番順はラウンドごとに2人ずつずれる", () => {
    const session = startedAt(STAGES.writing, new Session(4));
    const turn = session.gameSecret.turnOrder;
    session.toChecking();
    expect(session.publicState.entries.map((entry) => entry.playerId)).toEqual([turn[0], turn[1]]);
    session.readyAll();
    session.toChecking();
    expect(session.publicState.entries.slice(2).map((entry) => entry.playerId)).toEqual([turn[2], turn[3]]);
  });

  it("choosing へ入る時点で作者が切断している下書きは drafts に入らない", () => {
    const session = startedAt(STAGES.writing, new Session(4));
    session.must("p4", ACTIONS.submit, { text: session.passing() });
    session.disconnected = ["p4"];
    for (const id of ["p1", "p2", "p3"]) {
      session.must(id, ACTIONS.submit, { text: session.passing() });
    }
    expect(session.stage).toBe(STAGES.choosing);
    expect(session.publicState.drafts.map((draft) => draft.playerId)).not.toContain("p4");
  });

  it("作者の切断で2件未満になった回は、残った件数だけ判定する", () => {
    const session = startedAt(STAGES.writing, new Session(3));
    session.submitAll();
    expect(session.stage).toBe(STAGES.choosing);
    const [first, second] = session.publicState.drafts.map((draft) => draft.playerId);
    session.disconnected = [first as string, second as string];
    session.deadline();
    expect(session.stage).toBe(STAGES.checking);
    expect(session.publicState.entries).toHaveLength(1);
  });

  it("提出0件でも checking へ進み、1ラウンドとして数える", () => {
    const session = startedAt(STAGES.writing, new Session(3));
    session.deadline();
    expect(session.stage).toBe(STAGES.checking);
    expect(session.publicState.entries).toHaveLength(0);
    session.deadline();
    expect(session.publicState.roundIndex).toBe(1);
  });
});

describe("mark", () => {
  function choosing(): Session {
    const session = startedAt(STAGES.writing, new Session(3));
    session.submitAll();
    expect(session.stage).toBe(STAGES.choosing);
    return session;
  }

  it("3件以上、重複、drafts に無い作者、型違いを invalid_mark で拒否する", () => {
    const session = choosing();
    expect(session.act("p1", ACTIONS.mark, { roundIndex: 0, draftPlayerIds: ["p1", "p2", "p3"] })).toBe(
      ERROR_CODES.invalidMark,
    );
    expect(session.act("p1", ACTIONS.mark, { roundIndex: 0, draftPlayerIds: ["p1", "p1"] })).toBe(
      ERROR_CODES.invalidMark,
    );
    expect(session.act("p1", ACTIONS.mark, { roundIndex: 0, draftPlayerIds: ["nobody"] })).toBe(ERROR_CODES.invalidMark);
    expect(session.act("p1", ACTIONS.mark, { roundIndex: 0, draftPlayerIds: "p2" })).toBe(ERROR_CODES.invalidMark);
  });

  it("roundIndex の不一致と型違いを stale_round で拒否する", () => {
    const session = choosing();
    expect(session.act("p1", ACTIONS.mark, { roundIndex: 1, draftPlayerIds: ["p2"] })).toBe(ERROR_CODES.staleRound);
    expect(session.act("p1", ACTIONS.mark, { draftPlayerIds: ["p2"] })).toBe(ERROR_CODES.staleRound);
  });

  it("自分の下書きにも付けられ、空の配列で印が消える。印が変わると ready が解除される", () => {
    const session = choosing();
    session.must("p2", ACTIONS.ready);
    session.must("p1", ACTIONS.mark, { roundIndex: 0, draftPlayerIds: ["p1"] });
    expect(session.publicState.marks).toEqual([{ playerId: "p1", draftPlayerIds: ["p1"] }]);
    expect(session.publicState.readyPlayerIds).toEqual([]);
    session.must("p2", ACTIONS.ready);
    session.must("p1", ACTIONS.mark, { roundIndex: 0, draftPlayerIds: ["p1"] });
    expect(session.publicState.readyPlayerIds).toEqual(["p2"]);
    session.must("p1", ACTIONS.mark, { roundIndex: 0, draftPlayerIds: [] });
    expect(session.publicState.marks).toEqual([]);
  });
});

describe("select と回答", () => {
  it("型違い、候補に無いid、stale_round を拒否し、null で選択を消す", () => {
    const session = startedAt(STAGES.writing, new Session(2));
    session.toChecking();
    expect(session.act("p1", ACTIONS.select, { roundIndex: 0, candidateId: 3 })).toBe(ERROR_CODES.invalidCandidate);
    expect(session.act("p1", ACTIONS.select, { roundIndex: 0, candidateId: "nope" })).toBe(
      ERROR_CODES.invalidCandidate,
    );
    expect(session.act("p1", ACTIONS.select, { roundIndex: 2, candidateId: "no_i" })).toBe(ERROR_CODES.staleRound);
    const id = session.publicState.candidates[0]?.id as string;
    session.must("p1", ACTIONS.select, { roundIndex: 0, candidateId: id });
    expect(session.publicState.selections).toEqual([{ playerId: "p1", candidateId: id }]);
    session.must("p1", ACTIONS.select, { roundIndex: 0, candidateId: null });
    expect(session.publicState.selections).toEqual([]);
  });

  it("選択が揃った時点では判定せず、ステージも締切も変わらない。選択が変わると全員の ready が解除される", () => {
    const session = startedAt(STAGES.writing, new Session(2));
    session.toChecking();
    session.must("p2", ACTIONS.ready);
    session.selectAll(session.gameSecret.ruleCandidateId);
    expect(session.stage).toBe(STAGES.checking);
    expect(session.deadlineSeconds).toBeUndefined();
    expect(session.publicState.readyPlayerIds).toEqual([]);
    expect(session.publicState.answers).toEqual([]);
  });

  it("全員の ready で、選んだ全員が同じ正解の候補なら正解して proving へ進む", () => {
    const session = startedAt(STAGES.writing, new Session(3));
    session.toChecking();
    session.selectAll(session.gameSecret.ruleCandidateId);
    session.readyAll();
    expect(session.stage).toBe(STAGES.proving);
    expect(session.publicState.solvedCandidateId).toBe(session.gameSecret.ruleCandidateId);
    expect(session.publicState.avoidCandidateId).toBe(session.gameSecret.avoidCandidateId);
    expect(session.deadlineSeconds).toBe(session.publicState.writingSeconds);
    for (const id of session.ids()) {
      expect(session.stored.get(id)?.phase).toBe("proving");
    }
  });

  it("締切でも、選んだ人の選択が揃っていれば回答する。選ばない人は棄権として扱う", () => {
    const session = startedAt(STAGES.writing, new Session(3));
    session.toChecking();
    session.must("p1", ACTIONS.select, { roundIndex: 0, candidateId: session.gameSecret.ruleCandidateId });
    session.deadline();
    expect(session.stage).toBe(STAGES.proving);
  });

  it("選択が割れているか、誰も選んでいなければ回答せずに次のラウンドへ進む", () => {
    const session = startedAt(STAGES.writing, new Session(3));
    session.toChecking();
    session.must("p1", ACTIONS.select, { roundIndex: 0, candidateId: session.gameSecret.ruleCandidateId });
    session.must("p2", ACTIONS.select, { roundIndex: 0, candidateId: session.wrongCandidate() });
    session.readyAll();
    expect(session.stage).toBe(STAGES.writing);
    expect(session.publicState.answers).toEqual([]);
    session.toChecking();
    session.deadline();
    expect(session.publicState.answers).toEqual([]);
    expect(session.publicState.roundIndex).toBe(2);
  });

  it("切断した人の選択は数えない", () => {
    const session = startedAt(STAGES.writing, new Session(3));
    session.toChecking();
    session.must("p1", ACTIONS.select, { roundIndex: 0, candidateId: session.gameSecret.ruleCandidateId });
    session.must("p2", ACTIONS.select, { roundIndex: 0, candidateId: session.wrongCandidate() });
    session.disconnected = ["p2"];
    session.deadline();
    expect(session.stage).toBe(STAGES.proving);
  });

  it("誤答で answers に1行増え、次のラウンドで誤答の候補を選べない", () => {
    const session = startedAt(STAGES.writing, new Session(2));
    session.toChecking();
    const wrong = session.wrongCandidate();
    session.selectAll(wrong);
    session.readyAll();
    expect(session.publicState.answers).toEqual([{ roundIndex: 0, candidateId: wrong, correct: false }]);
    expect(session.stage).toBe(STAGES.writing);
    session.toChecking();
    expect(session.act("p1", ACTIONS.select, { roundIndex: 1, candidateId: wrong })).toBe(ERROR_CODES.invalidCandidate);
  });

  it("最終ラウンドの誤答と回答なしで、正解なしの結果を返して debrief へ進む", () => {
    const session = startedAt(STAGES.writing, new Session(2));
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      session.toChecking();
      session.selectAll(session.wrongCandidate());
      session.readyAll();
    }
    expect(session.stage).toBe(STAGES.debrief);
    expect(session.lifecycle).toBe("finished");
    expect(session.result).toMatchObject({ outcome: "unsolved", rank: "C", solvedRound: null, wrongCount: MAX_ROUNDS });
    expect(session.result?.rule.id).toBe(session.gameSecret.ruleCandidateId);
    expect(session.result?.tested).toHaveLength(MAX_ROUNDS * 2);
  });
});

describe("成否の配布", () => {
  it("判定にかかった英文の成否は作者の秘密にだけ入り、公開状態に現れない", () => {
    const session = startedAt(STAGES.writing, new Session(4));
    session.toChecking();
    const authors = session.publicState.entries.map((entry) => entry.playerId);
    for (const id of session.ids()) {
      const results = session.stored.get(id)?.results ?? [];
      if (authors.includes(id)) {
        expect(results).toHaveLength(1);
        expect(results[0]?.passed).toBe(satisfies(session.ruleSpec(), results[0]?.text ?? ""));
      } else {
        expect(results).toEqual([]);
      }
    }
  });

  it("前のラウンドの成否は次のラウンドの秘密にも残り、draft は消える", () => {
    const session = startedAt(STAGES.writing, new Session(2));
    session.toChecking();
    session.readyAll();
    expect(session.stage).toBe(STAGES.writing);
    for (const id of session.ids()) {
      const secret = session.stored.get(id);
      expect(secret?.phase).toBe("writing");
      expect(secret?.results).toHaveLength(1);
      expect(secret?.draft).toBeUndefined();
    }
  });
});

describe("proving と結果", () => {
  function provingSession(players: number): Session {
    const session = startedAt(STAGES.writing, new Session(players));
    session.toChecking();
    session.selectAll(session.gameSecret.ruleCandidateId);
    session.readyAll();
    expect(session.stage).toBe(STAGES.proving);
    return session;
  }

  function proofPassing(session: Session): string {
    return session.sentence(
      (text) => satisfies(session.ruleSpec(), text) && !satisfies(session.avoidSpec(), text),
    );
  }

  it("秘密の規則を満たし避ける候補を満たさない英文だけを通過とする。全員通過で1ラウンド目ならS", () => {
    const session = provingSession(2);
    for (const id of session.ids()) {
      session.must(id, ACTIONS.submit, { text: proofPassing(session) });
    }
    expect(session.stage).toBe(STAGES.debrief);
    expect(session.result).toMatchObject({ outcome: "solved", rank: "S", solvedRound: 1, wrongCount: 0, proofPassedCount: 2 });
  });

  it("避ける候補を満たす英文は通過しない。未提出者は通過していない人として数える", () => {
    const session = provingSession(3);
    session.must("p1", ACTIONS.submit, { text: proofPassing(session) });
    session.must("p2", ACTIONS.submit, {
      text: session.sentence((text) => satisfies(session.avoidSpec(), text)),
    });
    session.deadline();
    expect(session.stage).toBe(STAGES.debrief);
    expect(session.result?.proofEntries.map((entry) => entry.passed)).toEqual([true, false]);
    expect(session.result).toMatchObject({ proofPassedCount: 1, playerCount: 3, rank: "B" });
  });

  it("ランク: 誤答1回で過半数が通過すればA、誤答2回ならB", () => {
    const run = (wrongs: number) => {
      const session = startedAt(STAGES.writing, new Session(2));
      for (let round = 0; round < wrongs; round += 1) {
        session.toChecking();
        session.selectAll(session.wrongCandidate());
        session.readyAll();
      }
      session.toChecking();
      session.selectAll(session.gameSecret.ruleCandidateId);
      session.readyAll();
      for (const id of session.ids()) {
        session.must(id, ACTIONS.submit, { text: proofPassing(session) });
      }
      return session.result;
    };
    expect(run(1)).toMatchObject({ rank: "A", wrongCount: 1, solvedRound: 2 });
    expect(run(2)).toMatchObject({ rank: "B", wrongCount: 2, solvedRound: 3 });
  });

  it("3ラウンド目の正解は、誤答0回・全員通過でもSにならない", () => {
    const session = startedAt(STAGES.writing, new Session(2));
    for (let round = 0; round < 2; round += 1) {
      session.toChecking();
      session.readyAll();
    }
    session.toChecking();
    session.selectAll(session.gameSecret.ruleCandidateId);
    session.readyAll();
    for (const id of session.ids()) {
      session.must(id, ACTIONS.submit, { text: proofPassing(session) });
    }
    expect(session.result).toMatchObject({ rank: "A", solvedRound: 3, wrongCount: 0 });
  });
});

describe("rebuildSecret", () => {
  it("choosing を通る回と飛ばす回、上書き、切断を通して、遷移ごとに保存済みの値と一致する（6人）", () => {
    // Session が遷移ごとに全員分を突き合わせる。ここでは分岐を通すことが目的である
    const session = startedAt(STAGES.writing, new Session(6));
    session.must("p1", ACTIONS.submit, { text: session.failing() });
    session.must("p1", ACTIONS.submit, { text: session.passing() });
    session.disconnected = ["p5", "p6"];
    for (const id of ["p2", "p3", "p4"]) {
      session.must(id, ACTIONS.submit, { text: session.passing() });
    }
    expect(session.stage).toBe(STAGES.choosing);
    session.disconnected = [];
    session.deadline();
    expect(session.stage).toBe(STAGES.checking);
    session.readyAll();
    // 2件以下で choosing を飛ばす回
    session.must("p1", ACTIONS.submit, { text: session.passing() });
    session.deadline();
    expect(session.stage).toBe(STAGES.checking);
    session.selectAll(session.gameSecret.ruleCandidateId);
    session.readyAll();
    session.must("p2", ACTIONS.submit, { text: session.passing() });
    session.deadline();
    expect(session.stage).toBe(STAGES.debrief);
  });

  it("gameSecret が無いときと、参加者でないときに例外を投げる", () => {
    const session = new Session(2);
    expect(() =>
      secretRuleModule.rebuildSecret({
        room: session.room(),
        publicState: session.publicState,
        gameSecret: undefined,
        playerId: "p1",
      }),
    ).toThrow();
    expect(() => session.rebuild("nobody")).toThrow();
  });
});

describe("人数", () => {
  it.each([2, 6])("%i人で開始から debrief まで進む", (count) => {
    const session = startedAt(STAGES.writing, new Session(count));
    session.toChecking();
    session.selectAll(session.gameSecret.ruleCandidateId);
    session.readyAll();
    session.deadline();
    expect(session.stage).toBe(STAGES.debrief);
    expect(session.result?.playerCount).toBe(count);
  });
});
