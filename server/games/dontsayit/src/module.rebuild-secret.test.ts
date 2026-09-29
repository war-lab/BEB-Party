// 再接続時の秘密情報の作り直し（rebuildSecret）のテスト（ADR-0029、基本設計/09の再接続時の秘密情報）。
//
// 共通コアは再接続した人へ、保存済みの値ではなく rebuildSecret の戻り値を送る。
// 作り直した値が最後に送った値と食い違うと、再接続した説明者のカードが消えたり別のカードに変わったりする。
// これを防ぐため、遷移が返した secrets を共通コアと同じく上書きで溜め、各遷移の直後に全員分を突き合わせる。
//
// 山札が尽きる経路には小さいセットが要り、コンテンツ欠落の検査にはセットの差し替えが要る。
// vi.mock はファイル単位で効くため、モジュールテスト本体とはファイルを分ける。
import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackPlayerIconId, type Level, type Player, type Room } from "@beb/shared-core";
import {
  ACTIONS,
  MAX_CARD_ADVANCES_PER_ROUND,
  STAGES,
  type DontSayItPublic,
  type DontSayItSecret,
  type SpeakerSecret,
  type TabooSet,
} from "@beb/shared-dontsayit";

const LARGE_SET_ID = "fixture_set_v1";
const SMALL_SET_ID = "fixture_small_v1";

// テストがセットを差し替えられるよう、findSet が引く先を可変にしておく
const registry = vi.hoisted(() => ({ sets: new Map<string, TabooSet>(), originals: new Map<string, TabooSet>() }));

vi.mock("./sets", async () => {
  const { validSet } = await import("./test-support/fixtures");
  const { MIN_CARDS } = await import("@beb/shared-dontsayit");
  const large = validSet(MIN_CARDS);
  // 3枚しかない山札。上限に届く前に尽きる経路を通す
  const small: TabooSet = { ...validSet(3), id: SMALL_SET_ID };
  for (const target of [large, small]) {
    registry.sets.set(target.id, target);
    registry.originals.set(target.id, target);
  }
  return {
    SETS: [large, small],
    findSet: (setId: string) => registry.sets.get(setId),
    summarize: (target: TabooSet) => ({ id: target.id, title: target.title, cardCount: target.cards.length }),
  };
});

const { dontSayItModule } = await import("./module");
type GameSecret = import("./module").DontSayItGameSecret;
type Transition = ReturnType<typeof dontSayItModule.handleAction>;

afterEach(() => {
  // 差し替えたセットを戻す。他のテストへ持ち越さない
  registry.sets = new Map(registry.originals);
});

const SIX = [1, 2, 3, 3, 4, 5] as Level[];
const THREE = [1, 3, 5] as Level[];

interface Live {
  lifecycle: Room["lifecycle"];
  players: Player[];
  stage: string;
  contentId: string;
  publicState: DontSayItPublic;
  gameSecret: GameSecret;
  /** 共通コアの playerSecrets と同じく、送った秘密情報を playerId ごとに上書きで溜めたもの */
  sent: Map<string, DontSayItSecret>;
  /** 突き合わせた回数。経路が途中で止まっていないことの確認に使う */
  checks: number;
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

function roomOf(live: Live): Room {
  return {
    code: "AB12",
    lifecycle: live.lifecycle,
    players: live.players,
    gameId: "g",
    contentId: live.contentId,
    stage: live.stage,
  };
}

function rebuild(live: Live, playerId: string): DontSayItSecret | undefined {
  return dontSayItModule.rebuildSecret?.({
    room: roomOf(live),
    publicState: live.publicState,
    gameSecret: live.gameSecret,
    playerId,
  });
}

/**
 * 全員について、作り直した値と最後に送った値を突き合わせる。
 *
 * playing 中は一致すること、finished では送らない（undefined）ことを確かめる。
 */
function expectRebuildMatches(live: Live): Live {
  for (const player of live.players) {
    const rebuilt = rebuild(live, player.id);
    if (live.lifecycle === "finished") {
      expect(rebuilt, `finished の ${player.id}`).toBeUndefined();
    } else {
      expect(live.sent.get(player.id), `${live.stage} の ${player.id} へ送った値`).toBeDefined();
      expect(rebuilt, `${live.stage} round${live.publicState.roundIndex} の ${player.id}`).toEqual(
        live.sent.get(player.id),
      );
    }
  }
  return { ...live, checks: live.checks + 1 };
}

function start(levels: Level[], options: { contentId?: string; settings?: unknown; seed?: number } = {}): Live {
  const players = makePlayers(levels);
  const contentId = options.contentId ?? LARGE_SET_ID;
  const started = dontSayItModule.start({
    players,
    contentId,
    settings: options.settings,
    seed: options.seed ?? 4242,
  });
  return expectRebuildMatches({
    lifecycle: "playing",
    players,
    stage: started.stage,
    contentId,
    publicState: started.publicState,
    gameSecret: started.gameSecret as GameSecret,
    sent: new Map(started.secrets),
    checks: 0,
  });
}

/** GameTransitionを共通コアと同じ順で畳み込み、直後に突き合わせる（基本設計/01のapplyTransition） */
function apply(live: Live, transition: Transition): Live {
  expect(transition.reject, "想定外の拒否").toBeUndefined();
  const sent = new Map(live.sent);
  for (const [playerId, payload] of transition.secrets ?? []) {
    sent.set(playerId, payload as DontSayItSecret);
  }
  return expectRebuildMatches({
    ...live,
    lifecycle: transition.result !== undefined ? "finished" : live.lifecycle,
    stage: transition.stage ?? live.stage,
    publicState: transition.publicState ?? live.publicState,
    gameSecret: (transition.gameSecret ?? live.gameSecret) as GameSecret,
    sent,
  });
}

function send(live: Live, action: string, playerId: string, payload?: unknown): Live {
  return apply(
    live,
    dontSayItModule.handleAction({
      room: roomOf(live),
      publicState: live.publicState,
      gameSecret: live.gameSecret,
      playerId,
      action,
      payload,
    }),
  );
}

function fireDeadline(live: Live): Live {
  return apply(
    live,
    dontSayItModule.onDeadline({ room: roomOf(live), publicState: live.publicState, gameSecret: live.gameSecret }),
  );
}

function speakerOf(live: Live): string {
  return live.publicState.speakerOrder[live.publicState.roundIndex] as string;
}

function watcherOf(live: Live): string {
  const { speakerOrder, roundIndex } = live.publicState;
  return speakerOrder[(roundIndex + 1) % speakerOrder.length] as string;
}

function answererOf(live: Live): string {
  const speaker = speakerOf(live);
  const watcher = watcherOf(live);
  return live.players.map((player) => player.id).find((id) => id !== speaker && id !== watcher) as string;
}

function cardIdOf(live: Live): string | null {
  return live.gameSecret.currentCardId;
}

function claimCorrect(live: Live): Live {
  return send(live, ACTIONS.claimCorrect, speakerOf(live), { cardId: cardIdOf(live), playerId: answererOf(live) });
}

function reportViolation(live: Live): Live {
  return send(live, ACTIONS.reportViolation, watcherOf(live), { cardId: cardIdOf(live) });
}

function skipCard(live: Live): Live {
  return send(live, ACTIONS.skipCard, speakerOf(live), { cardId: cardIdOf(live) });
}

function setConnected(live: Live, playerId: string, connected: boolean): Live {
  // 接続の変化は遷移を伴わない。秘密情報は接続状態に依らないため、ここでも一致する
  return expectRebuildMatches({
    ...live,
    players: live.players.map((player) => (player.id === playerId ? { ...player, connected } : player)),
  });
}

function readyAll(live: Live): Live {
  return live.players.reduce((acc, player) => send(acc, ACTIONS.ready, player.id), live);
}

/** handoff から説明者の操作で explaining へ入る */
function startRound(live: Live): Live {
  return send(live, ACTIONS.startRound, speakerOf(live));
}

/** 上限まで正解を重ねてラウンドを終える */
function playToCap(live: Live): Live {
  let current = startRound(live);
  for (let count = 0; count < MAX_CARD_ADVANCES_PER_ROUND; count += 1) {
    current = claimCorrect(current);
  }
  return current;
}

/** パス・違反・正解のあと、explaining の締切でラウンドを終える */
function playMixedThenTimeout(live: Live): Live {
  let current = startRound(live);
  current = skipCard(current);
  current = reportViolation(current);
  current = claimCorrect(current);
  return fireDeadline(current);
}

/** 説明者が未接続のまま handoff の締切を迎え、ラウンドを飛ばす */
function skipAbsentSpeaker(live: Live): Live {
  const speaker = speakerOf(live);
  const skipped = fireDeadline(setConnected(live, speaker, false));
  // 飛ばされた説明者が戻る。再接続の時点でも一致する
  return setConnected(skipped, speaker, true);
}

/** handoff の締切で説明者の操作なしに explaining へ入り、そのまま締切で終える */
function playByDeadlines(live: Live): Live {
  return fireDeadline(fireDeadline(live));
}

const PLANS = [playToCap, playMixedThenTimeout, skipAbsentSpeaker, playByDeadlines];

/** ラウンドごとに進め方を順に替えながら、finished まで回す */
function playToEnd(live: Live, plans = PLANS): Live {
  let current = live;
  let round = 0;
  while (current.lifecycle === "playing") {
    expect(current.stage).toBe(STAGES.handoff);
    const plan = plans[round % plans.length] as (live: Live) => Live;
    current = plan(current);
    round += 1;
  }
  expect(current.stage).toBe(STAGES.debrief);
  return current;
}

describe("rebuildSecret: 最後に送った値との一致", () => {
  it("6人・1周で、上限到達・パスと違反と締切・説明者の未接続・締切だけの進行を通して一致する", () => {
    const live = playToEnd(readyAll(start(SIX)));
    expect(live.publicState.rounds).toHaveLength(6);
    // 飛ばしたラウンドを含め、全ラウンドの遷移で突き合わせたこと
    expect(live.checks).toBeGreaterThan(30);
  });

  it("6人・2周で、12ラウンドを通して一致する", () => {
    const live = playToEnd(readyAll(start(SIX, { settings: { laps: "2" } })));
    expect(live.publicState.rounds).toHaveLength(12);
  });

  it("3人・2周で、周の境目をまたいでも一致する", () => {
    const live = playToEnd(readyAll(start(THREE, { settings: { laps: "2" } })), [playMixedThenTimeout, playToCap]);
    expect(live.publicState.rounds).toHaveLength(6);
  });

  it("briefing の締切で handoff へ進んでも一致する", () => {
    const live = fireDeadline(start(SIX));
    expect(live.stage).toBe(STAGES.handoff);
    playToEnd(live);
  });

  it("最終ラウンドを説明者の未接続で飛ばして終えても、終局まで一致する", () => {
    let live = readyAll(start(THREE));
    live = playToCap(live);
    live = playToCap(live);
    live = skipAbsentSpeaker(live);
    expect(live.lifecycle).toBe("finished");
  });

  it("山札がラウンドの途中で尽きて終えても一致する", () => {
    // 3枚の山札。1枚目で成立、2枚目でパス、3枚目で違反すると次が引けず終局する
    let live = startRound(readyAll(start(SIX, { contentId: SMALL_SET_ID })));
    live = claimCorrect(live);
    live = skipCard(live);
    expect(live.lifecycle).toBe("playing");
    live = reportViolation(live);
    expect(live.lifecycle).toBe("finished");
    expect(live.publicState.rounds).toHaveLength(1);
  });

  it("山札がラウンドの終わりで尽きて終えても一致する", () => {
    // 1ラウンド目で2枚送り、締切で3枚目を捨て札にすると、次のラウンドへ配るカードが無い
    let live = startRound(readyAll(start(SIX, { contentId: SMALL_SET_ID })));
    live = claimCorrect(live);
    live = claimCorrect(live);
    live = fireDeadline(live);
    expect(live.lifecycle).toBe("finished");
  });
});

describe("rebuildSecret: finished では送らない", () => {
  it("finished では全員に undefined を返す", () => {
    const live = playToEnd(readyAll(start(SIX)));
    for (const player of live.players) {
      expect(rebuild(live, player.id)).toBeUndefined();
    }
  });

  it("finished を playing のまま作り直すと、最終ラウンドの説明者に見せていないカードが届く（送らない理由）", () => {
    // 終局時の endRound は次のカードを引いてから gameSecret を保存し、roundIndex を進めない。
    // lifecycle を見ずに作り直すと食い違うことを固定し、undefined を返す場合分けの根拠を残す
    let live = readyAll(start(SIX));
    while (live.lifecycle === "playing") {
      live = playToCap(live);
    }
    const lastSpeaker = speakerOf(live);
    const shown = live.sent.get(lastSpeaker) as SpeakerSecret;
    const naive = dontSayItModule.rebuildSecret?.({
      room: { ...roomOf(live), lifecycle: "playing" },
      publicState: live.publicState,
      gameSecret: live.gameSecret,
      playerId: lastSpeaker,
    }) as SpeakerSecret;
    expect(shown.role).toBe("speaker");
    expect(naive.card.cardId).not.toBe(shown.card.cardId);
    expect(live.gameSecret.usedCardIds).not.toContain(naive.card.cardId);
  });
});

describe("rebuildSecret: コンテンツが見つからない場合は例外を投げる", () => {
  // 例外なら共通コアが保存済みの値を送る。回答者へ劣化させると説明者がカードを失う（ADR-0029）
  it("お題セットが消えていたら例外を投げる", () => {
    const live = startRound(readyAll(start(SIX)));
    registry.sets.delete(LARGE_SET_ID);
    for (const player of live.players) {
      expect(() => rebuild(live, player.id)).toThrow();
    }
  });

  it("表示中のカードがセットから消えていたら、回答者へ劣化させず例外を投げる", () => {
    const live = startRound(readyAll(start(SIX)));
    const original = registry.originals.get(LARGE_SET_ID) as TabooSet;
    registry.sets.set(LARGE_SET_ID, {
      ...original,
      cards: original.cards.filter((card) => card.id !== cardIdOf(live)),
    });
    expect(() => rebuild(live, speakerOf(live))).toThrow();
    expect(() => rebuild(live, watcherOf(live))).toThrow();
    // 回答者の値はカードに依らないが、同じ状態から作る値の一部だけを返すと食い違いに気づけない
    expect(() => rebuild(live, answererOf(live))).toThrow();
  });

  it("playing 中に gameSecret が無ければ例外を投げる", () => {
    const live = start(SIX);
    expect(() =>
      dontSayItModule.rebuildSecret?.({
        room: roomOf(live),
        publicState: live.publicState,
        gameSecret: undefined,
        playerId: "p1",
      }),
    ).toThrow();
  });
});
