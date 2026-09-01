// GameModuleの振る舞い。Durable Objectなしで全項目を確かめる（基本設計/11のテスト観点）
import type { Player, Room } from "@beb/shared-core";
import {
  ACTIONS,
  ERROR_CODES,
  MAX_CHARS,
  POINTS_PER_CORRECT_GUESS,
  POINTS_PER_HIDDEN,
  ROUNDS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  WRITING_SECONDS,
  hintCountFor,
  pointsOf,
  type WhoWroteThisPublic,
  type WhoWroteThisSecret,
} from "@beb/shared-whowrotethis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhoWroteThisGameSecret } from "./module";
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

const { whoWroteThisModule } = await import("./module");

const PACK_ID = "fixture_pack";
const SEED = 4242;

let players: Player[];

beforeEach(() => {
  players = playersOf([1, 2, 3, 4, 5, 5]);
});

function startGame(input: { players?: Player[]; settings?: unknown; seed?: number } = {}) {
  return whoWroteThisModule.start({
    players: input.players ?? players,
    contentId: PACK_ID,
    settings: input.settings ?? {},
    seed: input.seed ?? SEED,
  });
}

function roomOf(
  publicState: WhoWroteThisPublic,
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
  publicState: WhoWroteThisPublic;
  gameSecret: WhoWroteThisGameSecret;
  stage: string;
  deadlineSeconds?: number;
  result?: { scores: { playerId: string; points: number }[] };
  reject?: { code: string };
  secrets?: Map<string, unknown>;
}

/** 1手を進める。返り値のpublicStateとgameSecretは未更新なら現状を維持する */
function act(
  progress: Progress,
  playerId: string,
  action: string,
  payload: unknown,
  overrides: { disconnected?: string[] } = {},
): Progress {
  const transition = whoWroteThisModule.handleAction({
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

function deadline(progress: Progress, overrides: { disconnected?: string[] } = {}): Progress {
  const transition = whoWroteThisModule.onDeadline({
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
    gameSecret: started.gameSecret as WhoWroteThisGameSecret,
    stage: started.stage,
    deadlineSeconds: started.deadlineSeconds,
    secrets: started.secrets as Map<string, unknown>,
  };
}

/** 接続中の全員がreadyを送る */
function readyAll(progress: Progress, overrides: { disconnected?: string[] } = {}): Progress {
  let current = progress;
  for (const player of players) {
    if (overrides.disconnected?.includes(player.id)) {
      continue;
    }
    current = act(current, player.id, ACTIONS.ready, {}, overrides);
  }
  return current;
}

/** 各自が識別できる英文を提出する */
function submitAll(progress: Progress, only?: readonly string[]): Progress {
  let current = progress;
  for (const player of players) {
    if (only !== undefined && !only.includes(player.id)) {
      continue;
    }
    current = act(current, player.id, ACTIONS.submit, { text: `I am player ${player.id} today.` });
  }
  return current;
}

/** 表示中の件に、作者以外の全員が指名する。targetOf で誰を指すかを決める */
function guessAll(progress: Progress, targetOf: (playerId: string, authorId: string) => string): Progress {
  let current = progress;
  const presented = current.publicState.presented;
  if (presented === null) {
    return current;
  }
  const authorId = authorOf(current);
  for (const player of players) {
    if (player.id === authorId) {
      continue;
    }
    current = act(current, player.id, ACTIONS.guess, {
      index: presented.index,
      targetPlayerId: targetOf(player.id, authorId),
    });
  }
  return current;
}

/** 表示中の件の作者。gameSecretの開示順と提出から引く */
function authorOf(progress: Progress): string {
  const presented = progress.publicState.presented;
  const roundIndex = progress.publicState.roundIndex;
  const submissions = progress.gameSecret.submissions[roundIndex] ?? {};
  const order = (progress.gameSecret.revealOrders[roundIndex] ?? []).filter(
    (playerId) => submissions[playerId] !== undefined,
  );
  return presented === null ? "" : (order[presented.index] ?? "");
}

describe("start", () => {
  it("briefingから始まり、締切と公開状態が揃う", () => {
    const started = startGame();
    expect(started.stage).toBe(STAGES.briefing);
    expect(started.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.briefing);
    expect(started.publicState.roundIndex).toBe(0);
    expect(started.publicState.totalRounds).toBe(ROUNDS);
    expect(started.publicState.question.en).toContain("?");
    expect(started.publicState.presented).toBeNull();
    expect(started.publicState.submittedPlayerIds).toEqual([]);
    expect(started.publicState.writingSeconds).toBe(WRITING_SECONDS.default);
    expect(started.publicState.scores.every((entry) => entry.points === 0)).toBe(true);
  });

  it("同じseedから同じ質問と同じ開示順を返す", () => {
    const a = startGame();
    const b = startGame();
    expect(a.gameSecret?.questionIds).toEqual(b.gameSecret?.questionIds);
    expect(a.gameSecret?.revealOrders).toEqual(b.gameSecret?.revealOrders);
  });

  it("使う質問はROUNDS件で、重複しない", () => {
    const started = startGame();
    const ids = started.gameSecret?.questionIds ?? [];
    expect(ids).toHaveLength(ROUNDS);
    expect(new Set(ids).size).toBe(ROUNDS);
  });

  it("開示順は参加者全員を含む（提出しなかった人は開示時に飛ばす）", () => {
    const started = startGame();
    for (const order of started.gameSecret?.revealOrders ?? []) {
      expect([...order].sort()).toEqual(players.map((player) => player.id).sort());
    }
  });

  it("hintEnの件数がレベルで変わる（レベル1〜2は3件、3以上は1件）", () => {
    const started = startGame();
    for (const player of players) {
      const secret = started.secrets.get(player.id) as WhoWroteThisSecret;
      expect(secret.hintEn).toHaveLength(hintCountFor(player.level));
      expect(secret.submission).toBeUndefined();
    }
  });

  it("公開状態に質問の答えを絞る材料（未使用の質問id）を置かない", () => {
    const started = startGame();
    const serialized = JSON.stringify(started.publicState);
    const unused = validPack()
      .questions.map((question) => question.id)
      .filter((id) => !(started.gameSecret?.questionIds ?? []).includes(id));
    for (const id of unused) {
      expect(serialized).not.toContain(id);
    }
  });
});

describe("listContents", () => {
  it("カタログに質問文と言い回しを載せない", () => {
    const serialized = JSON.stringify(whoWroteThisModule.listContents());
    const pack = validPack();
    for (const question of pack.questions) {
      expect(serialized).not.toContain(question.en);
      expect(serialized).not.toContain(question.ja);
      for (const hint of question.hintEn) {
        expect(serialized).not.toContain(hint);
      }
    }
    for (const expression of pack.keyExpressions) {
      expect(serialized).not.toContain(expression.en);
    }
  });
});

describe("ready", () => {
  it("接続中の全員が揃うとwritingへ進む", () => {
    const after = readyAll(begin());
    expect(after.stage).toBe(STAGES.writing);
    expect(after.deadlineSeconds).toBe(WRITING_SECONDS.default);
  });

  it("二重送信を冪等に扱う", () => {
    let current = begin();
    current = act(current, players[0]!.id, ACTIONS.ready, {});
    current = act(current, players[0]!.id, ACTIONS.ready, {});
    expect(current.reject).toBeUndefined();
    expect(current.publicState.readyPlayerIds).toEqual([players[0]!.id]);
  });

  it("writing中のreadyを拒否する", () => {
    const writing = readyAll(begin());
    const rejected = act(writing, players[0]!.id, ACTIONS.ready, {});
    expect(rejected.reject?.code).toBe(ERROR_CODES.invalidStage);
  });
});

describe("submit", () => {
  it("4語未満をtoo_shortで拒否する", () => {
    const writing = readyAll(begin());
    const rejected = act(writing, players[0]!.id, ACTIONS.submit, { text: "I do not" });
    expect(rejected.reject?.code).toBe(ERROR_CODES.tooShort);
  });

  it("上限を超える文字数をtoo_longで拒否する", () => {
    const writing = readyAll(begin());
    const long = `I ${"x".repeat(MAX_CHARS)} a b`;
    const rejected = act(writing, players[0]!.id, ACTIONS.submit, { text: long });
    expect(rejected.reject?.code).toBe(ERROR_CODES.tooLong);
  });

  it("文字列でないtextをinvalid_submissionで拒否する", () => {
    const writing = readyAll(begin());
    expect(act(writing, players[0]!.id, ACTIONS.submit, { text: 42 }).reject?.code).toBe(
      ERROR_CODES.invalidSubmission,
    );
    expect(act(writing, players[0]!.id, ACTIONS.submit, {}).reject?.code).toBe(ERROR_CODES.invalidSubmission);
  });

  it("改行と連続空白を正規化して受理する", () => {
    const writing = readyAll(begin());
    const after = act(writing, players[0]!.id, ACTIONS.submit, { text: " I  like\nit\ttoo. " });
    expect(after.reject).toBeUndefined();
    expect(after.gameSecret.submissions[0]?.[players[0]!.id]).toBe("I like it too.");
  });

  it("提出テキストを公開状態に載せない（提出済みのidだけ）", () => {
    const writing = readyAll(begin());
    const after = act(writing, players[0]!.id, ACTIONS.submit, { text: "I am the first player." });
    expect(JSON.stringify(after.publicState)).not.toContain("I am the first player.");
    expect(after.publicState.submittedPlayerIds).toEqual([players[0]!.id]);
  });

  it("上書きを許し、最後の提出だけが残る", () => {
    const writing = readyAll(begin());
    let current = act(writing, players[0]!.id, ACTIONS.submit, { text: "I wrote the first draft." });
    current = act(current, players[0]!.id, ACTIONS.submit, { text: "I wrote the second draft." });
    expect(current.gameSecret.submissions[0]?.[players[0]!.id]).toBe("I wrote the second draft.");
    expect(current.publicState.submittedPlayerIds).toEqual([players[0]!.id]);
  });

  it("受理のたびに本人へ submission を含む秘密を返し、hintEn を残す", () => {
    const writing = readyAll(begin());
    const after = act(writing, players[0]!.id, ACTIONS.submit, { text: "I am the first player." });
    const secret = after.secrets?.get(players[0]!.id) as WhoWroteThisSecret;
    expect(secret.submission).toBe("I am the first player.");
    expect(secret.hintEn).toHaveLength(hintCountFor(players[0]!.level));
    // 他のプレイヤーの秘密は書き換えない
    expect(after.secrets?.size).toBe(1);
  });

  it("接続中の全員が提出するとguessingへ進み、1件目を開示する", () => {
    const after = submitAll(readyAll(begin()));
    expect(after.stage).toBe(STAGES.guessing);
    expect(after.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.guessing);
    expect(after.publicState.presented?.index).toBe(0);
    expect(after.publicState.presented?.total).toBe(players.length);
    expect(after.publicState.presented?.text).toContain("I am player");
  });

  it("開示中の件の作者を公開状態に載せない", () => {
    const after = submitAll(readyAll(begin()));
    const presented = after.publicState.presented;
    expect(presented).not.toBeNull();
    expect(JSON.stringify(presented)).not.toContain("authorId");
  });

  it("提出順が開示順を変えない（早く書いた人が先頭に来ない）", () => {
    const forward = submitAll(readyAll(begin()));
    let reversed = readyAll(begin());
    for (const player of [...players].reverse()) {
      reversed = act(reversed, player.id, ACTIONS.submit, { text: `I am player ${player.id} today.` });
    }
    expect(reversed.publicState.presented?.text).toBe(forward.publicState.presented?.text);
  });
});

describe("guess", () => {
  function toGuessing(): Progress {
    return submitAll(readyAll(begin()));
  }

  it("作者からの指名をown_submissionで拒否する", () => {
    const guessing = toGuessing();
    const author = authorOf(guessing);
    const rejected = act(guessing, author, ACTIONS.guess, {
      index: 0,
      targetPlayerId: players.find((player) => player.id !== author)!.id,
    });
    expect(rejected.reject?.code).toBe(ERROR_CODES.ownSubmission);
  });

  it("index不一致をstale_guessで拒否する", () => {
    const guessing = toGuessing();
    const author = authorOf(guessing);
    const guesser = players.find((player) => player.id !== author)!.id;
    expect(act(guessing, guesser, ACTIONS.guess, { index: 1, targetPlayerId: author }).reject?.code).toBe(
      ERROR_CODES.staleGuess,
    );
    expect(act(guessing, guesser, ACTIONS.guess, { targetPlayerId: author }).reject?.code).toBe(
      ERROR_CODES.staleGuess,
    );
  });

  it("二重送信をalready_guessedで拒否し、初回を残す", () => {
    const guessing = toGuessing();
    const author = authorOf(guessing);
    const guesser = players.find((player) => player.id !== author)!.id;
    const first = act(guessing, guesser, ACTIONS.guess, { index: 0, targetPlayerId: author });
    const second = act(first, guesser, ACTIONS.guess, { index: 0, targetPlayerId: guesser === author ? author : author });
    expect(second.reject?.code).toBe(ERROR_CODES.alreadyGuessed);
    expect(first.gameSecret.currentGuesses[guesser]).toBe(author);
  });

  it("自分自身と未提出者への指名をinvalid_targetで拒否する", () => {
    const guessing = toGuessing();
    const author = authorOf(guessing);
    const guesser = players.find((player) => player.id !== author)!.id;
    expect(act(guessing, guesser, ACTIONS.guess, { index: 0, targetPlayerId: guesser }).reject?.code).toBe(
      ERROR_CODES.invalidTarget,
    );
    expect(act(guessing, guesser, ACTIONS.guess, { index: 0, targetPlayerId: "ghost" }).reject?.code).toBe(
      ERROR_CODES.invalidTarget,
    );
  });

  it("指名先を公開状態に載せない（済ませた人のidだけ）", () => {
    const guessing = toGuessing();
    const author = authorOf(guessing);
    const guesser = players.find((player) => player.id !== author)!.id;
    const after = act(guessing, guesser, ACTIONS.guess, { index: 0, targetPlayerId: author });
    expect(after.publicState.presented?.guessedPlayerIds).toEqual([guesser]);
    expect(JSON.stringify(after.publicState.presented)).not.toContain("targetPlayerId");
  });

  it("作者を除く接続中の全員が指名するとjudgingへ進む", () => {
    const after = guessAll(toGuessing(), (_, authorId) => authorId);
    expect(after.stage).toBe(STAGES.judging);
    expect(after.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.judging);
    expect(after.publicState.revealedItems).toHaveLength(1);
    expect(after.gameSecret.currentGuesses).toEqual({});
  });

  it("judgingで作者と指名の内訳を開示する", () => {
    const guessing = toGuessing();
    const author = authorOf(guessing);
    const after = guessAll(guessing, (_, authorId) => authorId);
    const item = after.publicState.revealedItems[0]!;
    expect(item.authorId).toBe(author);
    expect(item.guesses).toHaveLength(players.length - 1);
    expect(item.guesses.every((guess) => guess.targetPlayerId === author)).toBe(true);
  });
});

describe("得点", () => {
  it("正解した指名者に1点入る", () => {
    const guessing = submitAll(readyAll(begin()));
    const author = authorOf(guessing);
    const after = guessAll(guessing, (_, authorId) => authorId);
    for (const player of players) {
      const expected = player.id === author ? 0 : POINTS_PER_CORRECT_GUESS;
      expect(pointsOf(after.publicState.scores, player.id)).toBe(expected);
    }
  });

  it("当てた人が0人なら作者に1点入る", () => {
    const guessing = submitAll(readyAll(begin()));
    const author = authorOf(guessing);
    // 全員が作者以外を指す
    const after = guessAll(guessing, (playerId, authorId) => {
      const wrong = players.find((player) => player.id !== authorId && player.id !== playerId);
      return wrong!.id;
    });
    expect(pointsOf(after.publicState.scores, author)).toBe(POINTS_PER_HIDDEN);
    for (const player of players) {
      if (player.id !== author) {
        expect(pointsOf(after.publicState.scores, player.id)).toBe(0);
      }
    }
  });

  it("外した指名に減点を置かない", () => {
    const guessing = submitAll(readyAll(begin()));
    const author = authorOf(guessing);
    const after = guessAll(guessing, (playerId, authorId) => {
      // 1人だけ正解し、残りは外す
      const first = players.find((player) => player.id !== authorId)!;
      if (playerId === first.id) {
        return authorId;
      }
      const wrong = players.find((player) => player.id !== authorId && player.id !== playerId);
      return wrong!.id;
    });
    const wrongGuessers = players.filter(
      (player) => player.id !== author && player.id !== players.find((entry) => entry.id !== author)!.id,
    );
    for (const player of wrongGuessers) {
      expect(pointsOf(after.publicState.scores, player.id)).toBe(0);
    }
    // 正解者がいるため作者に隠し通しの点は入らない
    expect(pointsOf(after.publicState.scores, author)).toBe(0);
  });
});

describe("onDeadline", () => {
  it("briefingの締切でwritingへ進む", () => {
    const after = deadline(begin());
    expect(after.stage).toBe(STAGES.writing);
    expect(after.deadlineSeconds).toBe(WRITING_SECONDS.default);
  });

  it("writingの締切で未提出者を除いた件数で開示を始める", () => {
    const submitted = [players[0]!.id, players[1]!.id];
    const writing = submitAll(readyAll(begin()), submitted);
    const after = deadline(writing);
    expect(after.stage).toBe(STAGES.guessing);
    expect(after.publicState.presented?.total).toBe(submitted.length);
    expect(submitted).toContain(authorOf(after));
  });

  it("提出が0件のラウンドは得点を動かさずにrevealへ進む", () => {
    const writing = readyAll(begin());
    const after = deadline(writing);
    expect(after.stage).toBe(STAGES.reveal);
    expect(after.publicState.rounds).toHaveLength(1);
    expect(after.publicState.rounds[0]?.items).toEqual([]);
    expect(after.publicState.scores.every((entry) => entry.points === 0)).toBe(true);
  });

  it("提出が1件のラウンドも通常どおり得点計算まで進む", () => {
    const only = [players[2]!.id];
    const writing = submitAll(readyAll(begin()), only);
    const guessing = deadline(writing);
    expect(guessing.publicState.presented?.total).toBe(1);
    const after = guessAll(guessing, (_, authorId) => authorId);
    expect(after.stage).toBe(STAGES.judging);
    expect(pointsOf(after.publicState.scores, only[0]!)).toBe(0);
    expect(pointsOf(after.publicState.scores, players[0]!.id)).toBe(POINTS_PER_CORRECT_GUESS);
  });

  it("guessingの締切で未指名者を棄権として扱う", () => {
    const guessing = submitAll(readyAll(begin()));
    const author = authorOf(guessing);
    const guesser = players.find((player) => player.id !== author)!.id;
    const one = act(guessing, guesser, ACTIONS.guess, { index: 0, targetPlayerId: author });
    const after = deadline(one);
    expect(after.stage).toBe(STAGES.judging);
    expect(after.publicState.revealedItems[0]?.guesses).toHaveLength(1);
    expect(pointsOf(after.publicState.scores, guesser)).toBe(POINTS_PER_CORRECT_GUESS);
  });

  it("judgingの締切で次の件を開示する", () => {
    const judging = guessAll(submitAll(readyAll(begin())), (_, authorId) => authorId);
    const after = deadline(judging);
    expect(after.stage).toBe(STAGES.guessing);
    expect(after.publicState.presented?.index).toBe(1);
    expect(after.publicState.revealedItems).toHaveLength(1);
  });

  it("作者が切断していても開示と指名が進む", () => {
    const guessing = submitAll(readyAll(begin()));
    const author = authorOf(guessing);
    let current = guessing;
    for (const player of players) {
      if (player.id === author) {
        continue;
      }
      current = act(
        current,
        player.id,
        ACTIONS.guess,
        { index: 0, targetPlayerId: author },
        { disconnected: [author] },
      );
    }
    expect(current.stage).toBe(STAGES.judging);
    expect(current.publicState.revealedItems[0]?.authorId).toBe(author);
  });
});

describe("ラウンドの進行", () => {
  /** 現ラウンドの全件を消化してrevealまで進める */
  function playRound(progress: Progress): Progress {
    let current = submitAll(readyAll(progress));
    for (let index = 0; index < players.length; index += 1) {
      current = guessAll(current, (_, authorId) => authorId);
      current = deadline(current);
      if (current.stage !== STAGES.guessing) {
        break;
      }
    }
    return current;
  }

  it("全件の答え合わせを終えるとrevealへ進み、revealedItemsがroundsへ移る", () => {
    const after = playRound(begin());
    expect(after.stage).toBe(STAGES.reveal);
    expect(after.publicState.revealedItems).toEqual([]);
    expect(after.publicState.presented).toBeNull();
    expect(after.publicState.rounds).toHaveLength(1);
    expect(after.publicState.rounds[0]?.items).toHaveLength(players.length);
  });

  it("revealのreadyで次のラウンドのbriefingへ進み、秘密を送り直す", () => {
    const reveal = playRound(begin());
    const after = readyAll(reveal);
    expect(after.stage).toBe(STAGES.briefing);
    expect(after.publicState.roundIndex).toBe(1);
    expect(after.publicState.submittedPlayerIds).toEqual([]);
    expect(after.publicState.question.en).not.toBe(reveal.publicState.question.en);
    for (const player of players) {
      const secret = after.secrets?.get(player.id) as WhoWroteThisSecret;
      expect(secret.roundIndex).toBe(1);
      // 前のラウンドの提出が手元に残らない
      expect(secret.submission).toBeUndefined();
    }
  });

  it("最終ラウンドの最後の答え合わせでresultを返す", () => {
    const second = readyAll(playRound(begin()));
    const after = playRound(second);
    expect(after.result).toBeDefined();
    expect(after.publicState.rounds).toHaveLength(ROUNDS);
    const scores = after.result?.scores ?? [];
    expect(scores).toHaveLength(players.length);
    // 降順で返す
    expect([...scores].sort((a, b) => b.points - a.points)).toEqual(scores);
  });

  it("scoresが2ラウンドの通算になる", () => {
    const second = readyAll(playRound(begin()));
    const after = playRound(second);
    // 各自は自分の件以外の5件で指名し、この筋書きでは全問正解する。
    // 全員が当てられるため隠し通しの点は誰にも入らず、1ラウンド5点・2ラウンドで10点になる
    const perRound = (players.length - 1) * POINTS_PER_CORRECT_GUESS;
    for (const player of players) {
      expect(pointsOf(after.publicState.scores, player.id)).toBe(perRound * ROUNDS);
    }
  });
});

describe("validateSettings", () => {
  it("記述子のmin/maxと受理範囲が一致する", () => {
    const field = whoWroteThisModule.settingsFields[0]!;
    expect(field.key).toBe("writingSeconds");
    expect(field.min).toBe(WRITING_SECONDS.min);
    expect(field.max).toBe(WRITING_SECONDS.max);
    expect(whoWroteThisModule.validateSettings({ writingSeconds: WRITING_SECONDS.min }).valid).toBe(true);
    expect(whoWroteThisModule.validateSettings({ writingSeconds: WRITING_SECONDS.max }).valid).toBe(true);
    expect(whoWroteThisModule.validateSettings({ writingSeconds: WRITING_SECONDS.min - 1 }).valid).toBe(false);
    expect(whoWroteThisModule.validateSettings({ writingSeconds: WRITING_SECONDS.max + 1 }).valid).toBe(false);
  });

  it("型違いと欠損を扱う", () => {
    expect(whoWroteThisModule.validateSettings({ writingSeconds: "90" }).valid).toBe(false);
    expect(whoWroteThisModule.validateSettings({ writingSeconds: 90.5 }).valid).toBe(false);
    expect(whoWroteThisModule.validateSettings({}).valid).toBe(true);
    expect(whoWroteThisModule.validateSettings(undefined).valid).toBe(true);
  });

  it("stepの倍数でない値も範囲内なら受理する（stepは入力の刻み）", () => {
    expect(whoWroteThisModule.validateSettings({ writingSeconds: 95 }).valid).toBe(true);
  });

  it("設定した秒数がwritingの締切になる", () => {
    const after = readyAll(begin({ settings: { writingSeconds: WRITING_SECONDS.min } }));
    expect(after.deadlineSeconds).toBe(WRITING_SECONDS.min);
  });
});

describe("人数", () => {
  it("5人でも成立する", () => {
    players = playersOf([1, 2, 3, 4, 5]);
    const guessing = submitAll(readyAll(begin()));
    expect(guessing.publicState.presented?.total).toBe(5);
    const after = guessAll(guessing, (_, authorId) => authorId);
    expect(after.publicState.revealedItems).toHaveLength(1);
    expect(after.publicState.revealedItems[0]?.guesses).toHaveLength(4);
  });
});
