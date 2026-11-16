// GameModuleの振る舞い。Durable Objectなしで全項目を確かめる（基本設計/17のテスト観点）。
//
// Session が共通コアの代わりに状態を持ち、遷移のたびに次を確かめる。
// - 遷移が返した秘密を上書きで溜めた値と、rebuildSecret の戻り値が全員について一致すること（ADR-0029）
// - 公開状態のキーと配列の要素のキーが許可リストと一致すること（名前を変えた漏洩を落とす）
// - 公開状態に単語・チームの所属・回答の中身が現れないこと（ADR-0003）
// - 各自の秘密に自分以外の単語と味方のidが入らないこと
import {
  ACTION_MAX_CHARS,
  createRandom,
  formBalancedTeams,
  type GameTransition,
  type Player,
  type Room,
} from "@beb/shared-core";
import {
  ACTIONS,
  ANSWERING_SECONDS,
  BRIEFING_SECONDS,
  CLUE_SECONDS,
  ERROR_CODES,
  LAPS,
  STAGES,
  TEAM_SIZES,
  speakerOf,
  type Answer,
  type SecretTeamsPublic,
  type SecretTeamsResult,
  type SecretTeamsSecret,
} from "@beb/shared-secretteams";
import { describe, expect, it, vi } from "vitest";
import type { SecretTeamsGameSecret, TeamSecret } from "./module";
import { playersOf, validFamilies } from "./test-support/fixtures";

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

const { secretTeamsModule } = await import("./module");

const PACK_ID = "fixture_pack";
const SEED = 2026;

/** 公開状態に置いてよいキー（17の公開状態）。足すときは秘密を載せないことを確かめてから足す */
const PUBLIC_KEYS = [
  "packId",
  "themeChoices",
  "teamSizes",
  "maxAllyPicks",
  "speakerOrder",
  "laps",
  "turnIndex",
  "skippedTurns",
  "readyPlayerIds",
  "submittedPlayerIds",
  "keyExpressions",
  "clueSeconds",
] as const;

/** fixtures のパックの全単語の en */
const ALL_WORDS = validFamilies().flatMap((family) => family.themes.flatMap((theme) => theme.words.map((word) => word.en)));

type Transition = GameTransition<SecretTeamsPublic, SecretTeamsResult, SecretTeamsGameSecret>;

/** 共通コアの代わりに状態を持つ。secrets は上書きで溜め、result が返ったら finished にする */
class Session {
  readonly players: Player[];
  lifecycle: Room["lifecycle"] = "playing";
  stage: string;
  publicState: SecretTeamsPublic;
  gameSecret: SecretTeamsGameSecret;
  deadlineSeconds: number | undefined;
  readonly stored = new Map<string, SecretTeamsSecret>();
  /** 直前の遷移が返した秘密情報。送らなかった遷移では undefined */
  lastSecrets: Map<string, unknown> | undefined;
  result: SecretTeamsResult | undefined;
  disconnected: string[] = [];

  constructor(playerCount: number, input: { seed?: number; settings?: unknown; players?: Player[] } = {}) {
    this.players = input.players ?? playersOf(playerCount);
    const started = secretTeamsModule.start({
      players: this.players,
      contentId: PACK_ID,
      settings: input.settings ?? {},
      seed: input.seed ?? SEED,
    });
    this.stage = started.stage;
    this.deadlineSeconds = started.deadlineSeconds;
    this.publicState = started.publicState;
    this.gameSecret = started.gameSecret as SecretTeamsGameSecret;
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
    const transition = secretTeamsModule.handleAction({
      room: this.room(),
      publicState: this.publicState,
      gameSecret: this.gameSecret,
      playerId,
      action,
      payload,
    });
    if (transition.reject !== undefined) {
      // 拒否は状態を変えない（17の action の受理規則）
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
      secretTeamsModule.onDeadline({ room: this.room(), publicState: this.publicState, gameSecret: this.gameSecret }),
    );
  }

  /** 接続中の全員が ready を送る */
  readyAll(): void {
    for (const player of this.players) {
      if (this.stage !== STAGES.briefing) {
        break;
      }
      if (!this.disconnected.includes(player.id)) {
        this.must(player.id, ACTIONS.ready);
      }
    }
  }

  speaker(): string {
    const speaker = speakerOf(this.publicState);
    if (speaker === undefined) {
      throw new Error("手番の人がいない");
    }
    return speaker;
  }

  /** 手番の人が done を送る */
  done(): void {
    this.must(this.speaker(), ACTIONS.done, { turnIndex: this.publicState.turnIndex });
  }

  /** clue をすべて done で進め、answering へ入る */
  playClues(): void {
    while (this.stage === STAGES.clue) {
      this.done();
    }
    expect(this.stage).toBe(STAGES.answering);
  }

  submit(playerId: string, allyIds: unknown, opponentThemeId: unknown): string | undefined {
    return this.act(playerId, ACTIONS.submit, { allyIds, opponentThemeId });
  }

  teamOf(playerId: string): TeamSecret {
    const team = this.gameSecret.teams.find((entry) => entry.playerIds.includes(playerId));
    if (team === undefined) {
      throw new Error(`チームが無い: ${playerId}`);
    }
    return team;
  }

  opponentOf(playerId: string): TeamSecret {
    const own = this.teamOf(playerId);
    return this.gameSecret.teams.find((entry) => entry !== own) as TeamSecret;
  }

  /** 自分のチームでも相手のチームでもない選択肢（近いテーマ）のうち、相手の系統のもの以外を含む任意の外れ */
  wrongThemeFor(playerId: string): string {
    const own = this.teamOf(playerId).themeId;
    const opponent = this.opponentOf(playerId).themeId;
    const found = this.publicState.themeChoices.find((choice) => choice.id !== own && choice.id !== opponent);
    return found?.id ?? "";
  }

  /** 完全な回答（味方を全員当て、相手のテーマも当てる）。味方は maxAllyPicks までに収める */
  perfectAnswer(playerId: string): Answer {
    const allies = this.teamOf(playerId).playerIds.filter((id) => id !== playerId);
    return { allyIds: allies.slice(0, this.publicState.maxAllyPicks), opponentThemeId: this.opponentOf(playerId).themeId };
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
      this.stored.set(id, secret as SecretTeamsSecret);
    }
    if (transition.result !== undefined) {
      this.result = transition.result;
      this.lifecycle = "finished";
    }
    this.verify();
  }

  rebuild(playerId: string): SecretTeamsSecret | undefined {
    return secretTeamsModule.rebuildSecret({
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
    const state = this.publicState;
    expect(Object.keys(state).sort()).toEqual([...PUBLIC_KEYS].sort());
    for (const choice of state.themeChoices) {
      expect(Object.keys(choice).sort(), "themeChoices").toEqual(["en", "id", "ja"]);
    }
    for (const entry of state.keyExpressions) {
      expect(Object.keys(entry).sort(), "keyExpressions").toEqual(["en", "ja"]);
    }
    for (const key of ["teamSizes", "speakerOrder", "skippedTurns", "readyPlayerIds", "submittedPlayerIds"] as const) {
      for (const item of state[key]) {
        expect(typeof item === "string" || typeof item === "number", key).toBe(true);
      }
    }
    // どのステージの公開状態にも単語が現れない
    const json = JSON.stringify(state);
    for (const word of ALL_WORDS) {
      expect(json, `単語 ${word} が公開状態にある`).not.toContain(JSON.stringify(word));
    }

    // 各自の秘密に、自分以外の単語と味方のidが入らない。回答（本人が選んだもの）は除いて見る
    for (const [playerId, secret] of this.stored) {
      const keys = Object.keys(secret).sort();
      expect(keys.filter((key) => key !== "answer"), `secret ${playerId}`).toEqual(["themeId", "word"]);
      expect(secret.word).toEqual(this.gameSecret.words[playerId]);
      const { answer: _answer, ...rest } = secret;
      const own = JSON.stringify(rest);
      for (const [otherId, word] of Object.entries(this.gameSecret.words)) {
        if (otherId !== playerId) {
          expect(own, `${playerId} の秘密に ${otherId} の単語がある`).not.toContain(JSON.stringify(word.en));
          expect(own, `${playerId} の秘密に ${otherId} のidがある`).not.toContain(JSON.stringify(otherId));
        }
      }
    }
  }
}

/** 全員 ready → 全手番 done → answering まで進める */
function toAnswering(session: Session): void {
  session.readyAll();
  session.playClues();
}

describe("start", () => {
  it("決定性: 同じ seed と参加者から同じチーム、テーマ、単語、選択肢の並び、説明の順番が得られる", () => {
    const a = new Session(6, { seed: 7 });
    const b = new Session(6, { seed: 7 });
    expect(b.gameSecret).toEqual(a.gameSecret);
    expect(b.publicState).toEqual(a.publicState);
    expect(b.stored).toEqual(a.stored);
  });

  it("編成: 4〜8人で sizes が表のとおりになり、formBalancedTeams の結果がチームになる", () => {
    for (const count of [4, 5, 6, 7, 8]) {
      const session = new Session(count, { seed: count * 11 });
      const sizes = TEAM_SIZES[count]!;
      expect(session.gameSecret.teams.map((team) => team.playerIds.length).sort()).toEqual([...sizes].sort());
      expect(session.publicState.teamSizes).toEqual([...sizes].sort((x, y) => y - x));
      expect(session.publicState.maxAllyPicks).toBe(Math.max(...sizes) - 1);
      // start の手順4は seed から作った乱数の最初の呼び出しである
      const expected = formBalancedTeams(session.players, sizes, createRandom(count * 11));
      expect(session.gameSecret.teams.map((team) => team.playerIds)).toEqual(
        expected.map((members) => members.map((player) => player.id)),
      );
    }
  });

  it("抽選: 本物のテーマ2件は別の系統、近いテーマは本物と同じ系統から2件ずつ、同じチームの単語は本物のテーマの単語で重複しない", () => {
    const familyOf = new Map(validFamilies().flatMap((family) => family.themes.map((theme) => [theme.id, family.id])));
    for (let seed = 1; seed <= 50; seed += 1) {
      const session = new Session(8, { seed });
      const [first, second] = session.gameSecret.teams;
      expect(familyOf.get(first!.themeId)).not.toBe(familyOf.get(second!.themeId));
      const choices = session.publicState.themeChoices.map((choice) => choice.id);
      expect(new Set(choices).size).toBe(6);
      for (const team of session.gameSecret.teams) {
        const family = familyOf.get(team.themeId);
        expect(choices.filter((id) => familyOf.get(id) === family)).toHaveLength(3);
        const themeWords = validFamilies()
          .flatMap((entry) => entry.themes)
          .find((theme) => theme.id === team.themeId)!
          .words.map((word) => word.en);
        const dealt = team.playerIds.map((playerId) => session.gameSecret.words[playerId]!.en);
        expect(new Set(dealt).size).toBe(dealt.length);
        for (const word of dealt) {
          expect(themeWords).toContain(word);
        }
      }
    }
  });

  it("抽選: 多数の seed で、本物のテーマが themeChoices のどの位置にも現れる", () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const session = new Session(6, { seed });
      for (const team of session.gameSecret.teams) {
        positions.add(session.publicState.themeChoices.findIndex((choice) => choice.id === team.themeId));
      }
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("抽選: 多数の seed で、speakerOrder で同じチームの人が隣り合う割合が無作為の並びと同程度", () => {
    // 6人（3対3）を無作為に並べると、隣り合う2人が同じチームである確率は 2/5
    let same = 0;
    let pairs = 0;
    for (let seed = 1; seed <= 1000; seed += 1) {
      const session = new Session(6, { seed });
      const order = session.publicState.speakerOrder;
      for (let index = 0; index + 1 < order.length; index += 1) {
        pairs += 1;
        if (session.teamOf(order[index]!) === session.teamOf(order[index + 1]!)) {
          same += 1;
        }
      }
    }
    expect(Math.abs(same / pairs - 2 / 5)).toBeLessThan(0.03);
  });

  it("briefing から始まり、説明の順は参加者全員の並べ替えで、手番は0から", () => {
    const session = new Session(5);
    expect(session.stage).toBe(STAGES.briefing);
    expect(session.deadlineSeconds).toBe(BRIEFING_SECONDS);
    expect([...session.publicState.speakerOrder].sort()).toEqual(session.players.map((player) => player.id).sort());
    expect(session.publicState.turnIndex).toBe(0);
    expect(session.publicState.laps).toBe(LAPS);
    expect(session.publicState.clueSeconds).toBe(CLUE_SECONDS.default);
  });

  it("秘密の配布: start で全員へ自分の単語とテーマを送る", () => {
    const session = new Session(4);
    expect([...session.lastSecrets!.keys()].sort()).toEqual(["p1", "p2", "p3", "p4"]);
    for (const player of session.players) {
      expect(session.stored.get(player.id)).toEqual({
        word: session.gameSecret.words[player.id],
        themeId: session.teamOf(player.id).themeId,
      });
    }
  });

  it("秘密の非混入: listContents() にテーマと単語が含まれない", () => {
    const json = JSON.stringify(secretTeamsModule.listContents());
    expect(secretTeamsModule.listContents()).toEqual([{ id: PACK_ID, title: "テスト用のテーマ" }]);
    for (const family of validFamilies()) {
      expect(json).not.toContain(family.id);
      for (const theme of family.themes) {
        expect(json).not.toContain(theme.en);
        for (const word of theme.words) {
          expect(json).not.toContain(JSON.stringify(word.en));
        }
      }
    }
  });
});

describe("設定", () => {
  it("記述子の min / max と validateSettings の受理範囲が一致する", () => {
    const [field] = secretTeamsModule.settingsFields;
    expect(field).toMatchObject({ type: "number", key: "clueSeconds", min: 20, max: 60, step: 10, default: 30 });
    if (field?.type !== "number") {
      throw new Error("数値の設定でない");
    }
    expect(secretTeamsModule.validateSettings({ clueSeconds: field.min }).valid).toBe(true);
    expect(secretTeamsModule.validateSettings({ clueSeconds: field.max }).valid).toBe(true);
    expect(secretTeamsModule.validateSettings({ clueSeconds: field.min - 1 }).valid).toBe(false);
    expect(secretTeamsModule.validateSettings({ clueSeconds: field.max + 1 }).valid).toBe(false);
    // step は受理の条件にしない
    expect(secretTeamsModule.validateSettings({ clueSeconds: 25 }).valid).toBe(true);
  });

  it("型違いを拒否し、欠損は既定値を使う", () => {
    expect(secretTeamsModule.validateSettings({ clueSeconds: "30" }).valid).toBe(false);
    expect(secretTeamsModule.validateSettings({ clueSeconds: 30.5 }).valid).toBe(false);
    expect(secretTeamsModule.validateSettings("x").valid).toBe(false);
    expect(secretTeamsModule.validateSettings(undefined).valid).toBe(true);
    expect(secretTeamsModule.validateSettings({}).valid).toBe(true);
    expect(new Session(4, { settings: undefined }).publicState.clueSeconds).toBe(30);
    const session = new Session(4, { settings: { clueSeconds: 40 } });
    session.readyAll();
    expect(session.deadlineSeconds).toBe(40);
  });

  it("ロビーの記述子", () => {
    expect(secretTeamsModule.title).toBe("SECRET TEAMS");
    expect(secretTeamsModule.icon).toBe("\u{1F3AD}");
    expect(secretTeamsModule.playerCount).toEqual([4, 8]);
    expect(secretTeamsModule.contentLabelJa).toBe("テーマパックを選ぶ");
  });
});

describe("briefing から clue", () => {
  it("全員の ready で最初の手番の clue へ進み、締切は clueSeconds", () => {
    const session = new Session(4);
    session.readyAll();
    expect(session.stage).toBe(STAGES.clue);
    expect(session.publicState.turnIndex).toBe(0);
    expect(session.deadlineSeconds).toBe(CLUE_SECONDS.default);
    // clue へ入るときは秘密を送らない
    expect(session.lastSecrets).toBeUndefined();
  });

  it("締切でも clue へ進む", () => {
    const session = new Session(4);
    session.must("p1", ACTIONS.ready);
    session.deadline();
    expect(session.stage).toBe(STAGES.clue);
  });

  it("ready の二重送信は冪等であり、切断した人を待たない", () => {
    const session = new Session(4);
    session.must("p1", ACTIONS.ready);
    session.must("p1", ACTIONS.ready);
    expect(session.publicState.readyPlayerIds).toEqual(["p1"]);
    session.disconnected = ["p4"];
    session.must("p2", ACTIONS.ready);
    session.must("p3", ACTIONS.ready);
    expect(session.stage).toBe(STAGES.clue);
  });

  it("ステージ違い・参加者でない送信者・未知の action は invalid_stage", () => {
    const session = new Session(4);
    expect(session.act("p1", ACTIONS.done, { turnIndex: 0 })).toBe(ERROR_CODES.invalidStage);
    expect(session.submit("p1", ["p2"], "ocean")).toBe(ERROR_CODES.invalidStage);
    expect(session.act("p9", ACTIONS.ready)).toBe(ERROR_CODES.invalidStage);
    expect(session.act("p1", "dance")).toBe(ERROR_CODES.invalidStage);
    session.readyAll();
    expect(session.act("p1", ACTIONS.ready)).toBe(ERROR_CODES.invalidStage);
    expect(session.act("p9", ACTIONS.done, { turnIndex: 0 })).toBe(ERROR_CODES.invalidStage);
    session.playClues();
    expect(session.act(session.players[0]!.id, ACTIONS.done, { turnIndex: session.publicState.turnIndex })).toBe(
      ERROR_CODES.invalidStage,
    );
    expect(session.act("p9", ACTIONS.submit, { allyIds: ["p1"], opponentThemeId: "ocean" })).toBe(
      ERROR_CODES.invalidStage,
    );
  });
});

describe("done", () => {
  it("手番の人以外は not_speaker、turnIndex の不一致と型違いは stale_turn", () => {
    const session = new Session(4);
    session.readyAll();
    const speaker = session.speaker();
    const other = session.players.find((player) => player.id !== speaker)!.id;
    expect(session.act(other, ACTIONS.done, { turnIndex: 0 })).toBe(ERROR_CODES.notSpeaker);
    // not_speaker は stale_turn より先に判定する
    expect(session.act(other, ACTIONS.done, { turnIndex: 5 })).toBe(ERROR_CODES.notSpeaker);
    expect(session.act(speaker, ACTIONS.done, { turnIndex: 1 })).toBe(ERROR_CODES.staleTurn);
    expect(session.act(speaker, ACTIONS.done, { turnIndex: "0" })).toBe(ERROR_CODES.staleTurn);
    expect(session.act(speaker, ACTIONS.done)).toBe(ERROR_CODES.staleTurn);
    session.must(speaker, ACTIONS.done, { turnIndex: 0 });
    expect(session.publicState.turnIndex).toBe(1);
    expect(session.deadlineSeconds).toBe(CLUE_SECONDS.default);
  });

  it("1周目の done が遅れて届いても、2周目の同じ人の手番を終えない", () => {
    const session = new Session(4);
    session.readyAll();
    for (let turn = 0; turn < 4; turn += 1) {
      session.done();
    }
    expect(session.publicState.turnIndex).toBe(4);
    const speaker = session.speaker();
    expect(speaker).toBe(session.publicState.speakerOrder[0]);
    expect(session.act(speaker, ACTIONS.done, { turnIndex: 0 })).toBe(ERROR_CODES.staleTurn);
    expect(session.publicState.turnIndex).toBe(4);
  });

  it("手番の総数は人数 × 2 で、最後の手番の done で answering へ進み、turnIndex は最後の手番のまま", () => {
    const session = new Session(5);
    session.readyAll();
    let turns = 0;
    while (session.stage === STAGES.clue) {
      expect(session.publicState.turnIndex).toBe(turns);
      session.done();
      turns += 1;
    }
    expect(turns).toBe(10);
    expect(session.stage).toBe(STAGES.answering);
    expect(session.deadlineSeconds).toBe(ANSWERING_SECONDS);
    expect(session.publicState.turnIndex).toBe(9);
    expect(session.publicState.skippedTurns).toEqual([]);
  });

  it("最後の手番の締切でも answering へ進む", () => {
    const session = new Session(4);
    session.readyAll();
    for (let turn = 0; turn < 7; turn += 1) {
      session.deadline();
    }
    expect(session.stage).toBe(STAGES.clue);
    session.deadline();
    expect(session.stage).toBe(STAGES.answering);
    expect(session.publicState.turnIndex).toBe(7);
  });
});

describe("手番の飛ばし", () => {
  it("手番に入る時点で切断している人を飛ばし、skippedTurns に記録する。briefing 中の切断も最初の clue で飛ばす", () => {
    const session = new Session(4);
    const [first, second] = session.publicState.speakerOrder;
    session.disconnected = [first!];
    session.readyAll();
    expect(session.publicState.turnIndex).toBe(1);
    expect(session.speaker()).toBe(second);
    expect(session.publicState.skippedTurns).toEqual([0]);
  });

  it("続けて切断している人をまとめて飛ばす", () => {
    const session = new Session(6);
    const order = session.publicState.speakerOrder;
    session.readyAll();
    session.disconnected = [order[1]!, order[2]!];
    session.done();
    expect(session.publicState.turnIndex).toBe(3);
    expect(session.publicState.skippedTurns).toEqual([1, 2]);
    // 2周目でも同じ人を飛ばす
    session.done();
    session.done();
    session.done();
    expect(session.publicState.turnIndex).toBe(6);
    session.done();
    expect(session.publicState.turnIndex).toBe(9);
    expect(session.publicState.skippedTurns).toEqual([1, 2, 7, 8]);
  });

  it("残りの全員が切断していれば answering へ進む", () => {
    const session = new Session(4);
    session.readyAll();
    const order = session.publicState.speakerOrder;
    session.disconnected = order.filter((playerId) => playerId !== order[0]);
    session.done();
    // 1周目の1〜3を飛ばし、2周目の先頭（turnIndex 4）は接続中の order[0] の手番になる
    expect(session.publicState.turnIndex).toBe(4);
    expect(session.publicState.skippedTurns).toEqual([1, 2, 3]);
    session.done();
    expect(session.stage).toBe(STAGES.answering);
    expect(session.publicState.skippedTurns).toEqual([1, 2, 3, 5, 6, 7]);
    expect(session.publicState.turnIndex).toBe(7);

    // 全員が切断していれば、次の手番へ入る時点で最後まで飛ばして answering へ進む
    const empty = new Session(4);
    empty.readyAll();
    empty.disconnected = empty.players.map((player) => player.id);
    empty.deadline();
    expect(empty.stage).toBe(STAGES.answering);
    expect(empty.publicState.skippedTurns).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(empty.publicState.turnIndex).toBe(7);
  });

  it("手番の人が clue の最中に切断しても締切で次へ進む", () => {
    const session = new Session(4);
    session.readyAll();
    session.disconnected = [session.speaker()];
    session.deadline();
    expect(session.publicState.turnIndex).toBe(1);
    expect(session.publicState.skippedTurns).toEqual([]);
  });
});

describe("submit", () => {
  it("invalid_answer: allyIds が配列でない、opponentThemeId が文字列でない", () => {
    const session = new Session(6);
    toAnswering(session);
    const theme = session.opponentOf("p1").themeId;
    expect(session.submit("p1", "p2", theme)).toBe(ERROR_CODES.invalidAnswer);
    expect(session.submit("p1", ["p2"], 3)).toBe(ERROR_CODES.invalidAnswer);
    expect(session.act("p1", ACTIONS.submit)).toBe(ERROR_CODES.invalidAnswer);
    // invalid_answer は invalid_ally より先に判定する
    expect(session.submit("p1", [], 3)).toBe(ERROR_CODES.invalidAnswer);
  });

  it("invalid_ally: 0件、上限超え、重複、自分、参加者でないid、文字列でないid", () => {
    const session = new Session(6);
    toAnswering(session);
    expect(session.publicState.maxAllyPicks).toBe(2);
    const theme = session.opponentOf("p1").themeId;
    expect(session.submit("p1", [], theme)).toBe(ERROR_CODES.invalidAlly);
    expect(session.submit("p1", ["p2", "p3", "p4"], theme)).toBe(ERROR_CODES.invalidAlly);
    expect(session.submit("p1", ["p2", "p2"], theme)).toBe(ERROR_CODES.invalidAlly);
    expect(session.submit("p1", ["p1"], theme)).toBe(ERROR_CODES.invalidAlly);
    expect(session.submit("p1", ["p9"], theme)).toBe(ERROR_CODES.invalidAlly);
    expect(session.submit("p1", [2], theme)).toBe(ERROR_CODES.invalidAlly);
    // invalid_ally は invalid_theme より先に判定する
    expect(session.submit("p1", [], "nope")).toBe(ERROR_CODES.invalidAlly);
  });

  it("invalid_theme: 選択肢に無いid、自分のテーマ", () => {
    const session = new Session(6);
    toAnswering(session);
    expect(session.submit("p1", ["p2"], "nope")).toBe(ERROR_CODES.invalidTheme);
    expect(session.submit("p1", ["p2"], session.teamOf("p1").themeId)).toBe(ERROR_CODES.invalidTheme);
    // 近いテーマは選べる（外れになるだけ）
    expect(session.submit("p1", ["p2"], session.wrongThemeFor("p1"))).toBeUndefined();
  });

  it("上書きで最後の回答だけが有効になり、本人にだけ回答入りの秘密を送る。公開状態には回答者のidだけが載る", () => {
    const session = new Session(4);
    toAnswering(session);
    const theme = session.opponentOf("p1").themeId;
    expect(session.submit("p1", ["p2"], theme)).toBeUndefined();
    expect(session.submit("p1", ["p3"], session.wrongThemeFor("p1"))).toBeUndefined();
    expect([...session.lastSecrets!.keys()]).toEqual(["p1"]);
    expect(session.stored.get("p1")?.answer).toEqual({ allyIds: ["p3"], opponentThemeId: session.wrongThemeFor("p1") });
    expect(session.gameSecret.answers.p1).toEqual({ allyIds: ["p3"], opponentThemeId: session.wrongThemeFor("p1") });
    expect(session.publicState.submittedPlayerIds).toEqual(["p1"]);
    expect(session.stage).toBe(STAGES.answering);
  });

  it("接続中の全員の回答で reveal へ進む。その遷移に最後の回答者の秘密が載り、切断した人を待たない", () => {
    const session = new Session(4);
    toAnswering(session);
    session.disconnected = ["p4"];
    for (const playerId of ["p1", "p2"]) {
      const answer = session.perfectAnswer(playerId);
      expect(session.submit(playerId, answer.allyIds, answer.opponentThemeId)).toBeUndefined();
    }
    const last = session.perfectAnswer("p3");
    expect(session.submit("p3", last.allyIds, last.opponentThemeId)).toBeUndefined();
    expect(session.stage).toBe(STAGES.reveal);
    expect(session.lifecycle).toBe("finished");
    expect([...session.lastSecrets!.keys()]).toEqual(["p3"]);
    expect(session.stored.get("p3")?.answer).toEqual(last);
    // reveal は締切を置かない
    expect(session.deadlineSeconds).toBeUndefined();
  });

  it("ペイロード: 8人で味方を3人選んだ submit のペイロードが ACTION_MAX_CHARS 未満", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const payload = { allyIds: [uuid, uuid, uuid], opponentThemeId: "a".repeat(16) };
    expect(JSON.stringify(payload).length).toBeLessThan(ACTION_MAX_CHARS);
  });
});

/** 決めた回答を全員が送り、reveal まで進めて result を返す。null は回答しない */
function finishWith(session: Session, answerOf: (playerId: string) => Answer | null): SecretTeamsResult {
  for (const player of session.players) {
    const answer = answerOf(player.id);
    if (answer !== null && session.stage === STAGES.answering) {
      expect(session.submit(player.id, answer.allyIds, answer.opponentThemeId)).toBeUndefined();
    }
  }
  if (session.stage === STAGES.answering) {
    session.deadline();
  }
  expect(session.stage).toBe(STAGES.reveal);
  return session.result!;
}

function teamResult(session: Session, result: SecretTeamsResult, playerId: string) {
  return result.teams.find((team) => team.theme.id === session.teamOf(playerId).themeId)!;
}

describe("得点", () => {
  it("全員が完全に当てると両チーム100点で引き分け", () => {
    const session = new Session(6);
    toAnswering(session);
    const result = finishWith(session, (playerId) => session.perfectAnswer(playerId));
    expect(result.teams.map((team) => team.score)).toEqual([100, 100]);
    expect(result.outcome).toBe("draw");
    expect(result.winnerThemeId).toBeNull();
  });

  it("合流率は誤った選択を差し引き、0で下限を取る。見抜き率は当てた人の割合", () => {
    const session = new Session(8);
    toAnswering(session);
    const [teamA, teamB] = session.gameSecret.teams;
    const a = teamA!.playerIds;
    const b = teamB!.playerIds;
    const result = finishWith(session, (playerId) => {
      if (playerId === a[0]) {
        // 味方2人 + 相手1人: (2 − 1) / 3
        return { allyIds: [a[1]!, a[2]!, b[0]!], opponentThemeId: teamB!.themeId };
      }
      if (playerId === a[1]) {
        // 相手だけを3人: max(0, 0 − 3) = 0
        return { allyIds: [b[0]!, b[1]!, b[2]!], opponentThemeId: teamB!.themeId };
      }
      if (playerId === a[2]) {
        // 味方3人: 1。テーマは外す
        return { allyIds: [a[0]!, a[1]!, a[3]!], opponentThemeId: session.wrongThemeFor(playerId) };
      }
      if (playerId === a[3]) {
        return null;
      }
      return session.perfectAnswer(playerId);
    });
    const resultA = teamResult(session, result, a[0]!);
    const resultB = teamResult(session, result, b[0]!);
    expect(resultA.joinRate).toBeCloseTo((1 / 3 + 0 + 1 + 0) / 4);
    expect(resultA.spotRate).toBe(2 / 4);
    // round(0.3333 × 50 + 0.5 × 50) = round(41.67) = 42
    expect(resultA.score).toBe(42);
    expect(resultB.score).toBe(100);
    expect(result.outcome).toBe("win");
    expect(result.winnerThemeId).toBe(teamB!.themeId);
    const recordA0 = result.answers.find((record) => record.playerId === a[0])!;
    expect(recordA0).toMatchObject({ correctAllyCount: 2, wrongAllyCount: 1, themeCorrect: true });
    const recordA3 = result.answers.find((record) => record.playerId === a[3])!;
    expect(recordA3).toEqual({ playerId: a[3], answer: null, correctAllyCount: 0, wrongAllyCount: 0, themeCorrect: false });
  });

  it("奇数人数の小さいチームの人が上限まで選ぶと、味方を全員選べても1人分を差し引かれる", () => {
    const session = new Session(7);
    toAnswering(session);
    expect(session.publicState.maxAllyPicks).toBe(3);
    const small = session.gameSecret.teams.find((team) => team.playerIds.length === 3)!;
    const big = session.gameSecret.teams.find((team) => team.playerIds.length === 4)!;
    const [s0, s1, s2] = small.playerIds as [string, string, string];
    const result = finishWith(session, (playerId) => {
      if (playerId === s0) {
        return { allyIds: [s1, s2, big.playerIds[0]!], opponentThemeId: big.themeId };
      }
      return session.perfectAnswer(playerId);
    });
    const smallResult = teamResult(session, result, s0);
    // s0 は (2 − 1) / 2 = 0.5、他の2人は1。合流率 2.5 / 3
    expect(smallResult.joinRate).toBeCloseTo(2.5 / 3);
    expect(smallResult.score).toBe(Math.round((2.5 / 3) * 50 + 50));
    expect(smallResult.score).toBe(92);
  });

  it("四捨五入: 12.5 は 13 になり、同点は引き分け", () => {
    const session = new Session(8);
    toAnswering(session);
    const [teamA, teamB] = session.gameSecret.teams;
    const a = teamA!.playerIds;
    const b = teamB!.playerIds;
    // A: 1人だけ味方を1人当て（1/3）、テーマは全員外す → 合流率 1/12 → 4.1667 → 4
    // B: 3人が味方を1人当て（各1/3）、テーマは全員外す → 合流率 3/12 = 0.25 → 12.5 → 13
    const result = finishWith(session, (playerId) => {
      const team = a.includes(playerId) ? a : b;
      const wrong = session.wrongThemeFor(playerId);
      const ally = team.find((id) => id !== playerId)!;
      if (playerId === a[0] || b.slice(0, 3).includes(playerId)) {
        return { allyIds: [ally], opponentThemeId: wrong };
      }
      const enemy = (team === a ? b : a)[0]!;
      return { allyIds: [enemy], opponentThemeId: wrong };
    });
    expect(teamResult(session, result, a[0]!).score).toBe(4);
    expect(teamResult(session, result, b[0]!).score).toBe(13);
    expect(result.winnerThemeId).toBe(teamB!.themeId);

    const tie = new Session(4);
    toAnswering(tie);
    const tieResult = finishWith(tie, () => null);
    expect(tieResult.teams.map((team) => team.score)).toEqual([0, 0]);
    expect(tieResult.outcome).toBe("draw");
  });

  it("未回答の人と切断した人は分母に入り、0として数える", () => {
    const session = new Session(6);
    toAnswering(session);
    const [teamA] = session.gameSecret.teams;
    const a = teamA!.playerIds;
    session.disconnected = [a[2]!];
    const result = finishWith(session, (playerId) =>
      playerId === a[1] || playerId === a[2] ? null : session.perfectAnswer(playerId),
    );
    // 切断した a[2] は回答していない。a[1] も未回答。全員の回答で reveal へ進まず、締切で終わる
    const resultA = teamResult(session, result, a[0]!);
    expect(resultA.joinRate).toBeCloseTo(1 / 3);
    expect(resultA.spotRate).toBeCloseTo(1 / 3);
    expect(resultA.score).toBe(33);
    expect(result.answers).toHaveLength(6);
    expect(result.playerCount).toBe(6);
  });
});

describe("結果", () => {
  it("両チームのテーマ・メンバー・単語、選択肢6件、全員の回答が載る", () => {
    const session = new Session(5);
    toAnswering(session);
    const result = finishWith(session, (playerId) => session.perfectAnswer(playerId));
    expect(result.teams).toHaveLength(2);
    expect(result.themeChoices).toEqual(session.publicState.themeChoices);
    for (const team of result.teams) {
      const secretTeam = session.gameSecret.teams.find((entry) => entry.themeId === team.theme.id)!;
      expect(team.members).toEqual(
        secretTeam.playerIds.map((playerId) => ({ playerId, word: session.gameSecret.words[playerId] })),
      );
    }
    expect(result.answers.map((record) => record.playerId)).toEqual(session.players.map((player) => player.id));
  });
});

describe("rebuildSecret", () => {
  it("gameSecret が無いときに例外を投げ、参加者でないときに undefined を返す", () => {
    const session = new Session(4);
    expect(() =>
      secretTeamsModule.rebuildSecret({
        room: session.room(),
        publicState: session.publicState,
        gameSecret: undefined,
        playerId: "p1",
      }),
    ).toThrow();
    expect(session.rebuild("p9")).toBeUndefined();
  });

  for (const count of [4, 8]) {
    it(`${count}人: 回答の上書きと締切での終局を通し、各遷移の直後に溜めた値と一致する`, () => {
      // 一致は Session.verify が各遷移の直後に確かめる。ここは遷移の種類を通す
      const session = new Session(count, { seed: count });
      session.readyAll();
      session.deadline();
      session.disconnected = [session.publicState.speakerOrder[3]!];
      session.playClues();
      const first = session.perfectAnswer("p1");
      expect(session.submit("p1", first.allyIds, first.opponentThemeId)).toBeUndefined();
      expect(session.submit("p1", first.allyIds, session.wrongThemeFor("p1"))).toBeUndefined();
      expect(session.submit("p2", session.perfectAnswer("p2").allyIds, session.perfectAnswer("p2").opponentThemeId)).toBeUndefined();
      session.deadline();
      expect(session.stage).toBe(STAGES.reveal);
      expect(session.rebuild("p1")?.answer?.opponentThemeId).toBe(session.wrongThemeFor("p1"));
      expect(session.rebuild("p3")?.answer).toBeUndefined();
    });
  }
});

describe("人数", () => {
  for (const count of [4, 5, 6, 7, 8]) {
    it(`${count}人で開始から reveal まで進む`, () => {
      const session = new Session(count, { seed: count * 3 });
      toAnswering(session);
      const result = finishWith(session, (playerId) => session.perfectAnswer(playerId));
      expect(result.playerCount).toBe(count);
      expect(result.answers).toHaveLength(count);
      // 小さいチームでも味方を全員選べば合流率は1
      for (const team of result.teams) {
        expect(team.joinRate).toBe(1);
      }
    });
  }
});
