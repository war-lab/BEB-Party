// DON'T SAY ITのGameModuleは純粋関数のため、Durable Objectなしで全項目をテストする（基本設計/09）
import { describe, expect, it, vi } from "vitest";
import type { Level, Player, Room } from "@beb/shared-core";
import {
  ACTIONS,
  ERROR_CODES,
  MAX_CARD_ADVANCES_PER_ROUND,
  ROUND_SECONDS,
  STAGES,
  type DontSayItPublic,
  type DontSayItResult,
  type DontSayItSecret,
  type SpeakerSecret,
  type WatcherSecret,
} from "@beb/shared-dontsayit";

// 収録前でも進行を検証できるようにフィクスチャのセットを差し込む。
// モジュール側にテスト用の差し込み口を作らないため、ここでモックする
vi.mock("./sets", async () => {
  // 6人×1ラウンドの消費上限を回しきれる枚数（MIN_CARDS）を積む
  const { validSet } = await import("./test-support/fixtures");
  const target = validSet(36);
  return {
    SETS: [target],
    findSet: (setId: string) => (setId === target.id ? target : undefined),
    summarize: () => ({ id: target.id, title: target.title, cardCount: target.cards.length }),
  };
});

const { dontSayItModule } = await import("./module");
type GameSecret = import("./module").DontSayItGameSecret;

const SET_ID = "fixture_set_v1";
const SEED = 4242;

function makePlayers(levels: Level[]): Player[] {
  return levels.map((level, index) => ({
    id: `p${index + 1}`,
    name: `Player${index + 1}`,
    level,
    connected: true,
    isHost: index === 0,
  }));
}

interface Live {
  players: Player[];
  stage: string;
  publicState: DontSayItPublic;
  gameSecret: GameSecret;
  secrets: Map<string, DontSayItSecret>;
  result?: DontSayItResult;
  reject?: { code: string };
  deadlineSeconds?: number;
}

function roomOf(live: Live): Room {
  return { code: "AB12", lifecycle: "playing", players: live.players, gameId: "g", contentId: SET_ID, stage: live.stage };
}

function start(levels: Level[], seed = SEED, settings: unknown = undefined): Live {
  const players = makePlayers(levels);
  const started = dontSayItModule.start({ players, contentId: SET_ID, settings, seed });
  return {
    players,
    stage: started.stage,
    publicState: started.publicState,
    gameSecret: started.gameSecret as GameSecret,
    secrets: started.secrets,
    deadlineSeconds: started.deadlineSeconds,
  };
}

/** GameTransitionを共通コアと同じ順で畳み込む（基本設計/01のapplyTransition） */
function apply(live: Live, transition: ReturnType<typeof dontSayItModule.handleAction>): Live {
  if (transition.reject !== undefined) {
    return { ...live, reject: transition.reject };
  }
  const secrets = new Map(live.secrets);
  for (const [playerId, payload] of transition.secrets ?? []) {
    secrets.set(playerId, payload as DontSayItSecret);
  }
  return {
    ...live,
    reject: undefined,
    stage: transition.stage ?? live.stage,
    publicState: transition.publicState ?? live.publicState,
    gameSecret: (transition.gameSecret ?? live.gameSecret) as GameSecret,
    secrets,
    deadlineSeconds: transition.deadlineSeconds ?? live.deadlineSeconds,
    result: transition.result ?? live.result,
  };
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

function readyAll(live: Live): Live {
  return live.players.reduce((acc, player) => send(acc, ACTIONS.ready, player.id), live);
}

/** briefing → handoff → explaining まで進める */
function toExplaining(live: Live): Live {
  const afterReady = readyAll(live);
  const speakerId = afterReady.publicState.speakerOrder[afterReady.publicState.roundIndex] as string;
  return send(afterReady, ACTIONS.startRound, speakerId);
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

function currentCardId(live: Live): string {
  return live.gameSecret.currentCardId as string;
}

const SIX = [1, 2, 3, 3, 4, 5] as Level[];

describe("start", () => {
  it("同じseedと同じ参加者から同じ説明者順と同じ山札が得られる", () => {
    const a = start(SIX);
    const b = start(SIX);
    expect(a.publicState.speakerOrder).toEqual(b.publicState.speakerOrder);
    expect(a.gameSecret.deck).toEqual(b.gameSecret.deck);
  });

  it("seedが違えば説明者順が変わる", () => {
    const a = start(SIX, 1);
    const b = start(SIX, 999_999);
    expect(a.publicState.speakerOrder).not.toEqual(b.publicState.speakerOrder);
  });

  it("briefingから始まり、全員の得点が0で並ぶ", () => {
    const live = start(SIX);
    expect(live.stage).toBe(STAGES.briefing);
    expect(live.publicState.scores.every((entry) => entry.points === 0)).toBe(true);
    expect(live.publicState.scores).toHaveLength(6);
  });

  it("roundSecondsの既定値が入る", () => {
    expect(start(SIX).publicState.roundSeconds).toBe(ROUND_SECONDS.default);
  });

  it("roundSecondsの指定を受け入れる", () => {
    expect(start(SIX, SEED, { roundSeconds: 60 }).publicState.roundSeconds).toBe(60);
  });
});

describe("秘密の非混入", () => {
  it("公開状態に人物名・禁止語・山札が現れない", () => {
    const live = toExplaining(start(SIX));
    const serialized = JSON.stringify(live.publicState);
    const card = live.gameSecret.deck[0] as string;
    expect(serialized).not.toContain("Name");
    expect(serialized).not.toContain("clue");
    expect(serialized).not.toContain(card);
  });

  it("カタログに人物名と禁止語が現れない", () => {
    const serialized = JSON.stringify(dontSayItModule.listContents());
    expect(serialized).not.toContain("Name");
    expect(serialized).not.toContain("clue");
  });

  it("監視役の秘密は正解と禁止語を持ち、説明者と同じカードを指す", () => {
    // 正解を渡すのは、説明者が正解そのものを口に出したときに押せるボタンが必要なため（09の3役）
    const live = toExplaining(start(SIX));
    const speaker = live.secrets.get(speakerOf(live)) as SpeakerSecret;
    const watcher = live.secrets.get(watcherOf(live)) as WatcherSecret;
    expect(watcher.role).toBe("watcher");
    expect(watcher.answer).toBe(speaker.card.answer);
    expect(watcher.cardId).toBe(speaker.card.cardId);
  });

  it("回答者の秘密には正解も禁止語も含まれない", () => {
    const live = toExplaining(start(SIX));
    const answerer = live.secrets.get(answererOf(live)) as DontSayItSecret;
    expect(JSON.stringify(answerer)).not.toContain("Name");
    expect(JSON.stringify(answerer)).not.toContain("clue");
  });

  it("回答者の秘密は役だけを持つ", () => {
    const live = toExplaining(start(SIX));
    expect(live.secrets.get(answererOf(live))).toEqual({ role: "answerer" });
  });
});

describe("レベル別の禁止語の提示数", () => {
  it("レベル1の説明者には先頭3語だけを渡し、制約カードを渡さない", () => {
    // 説明者順はシャッフルされるため、レベルを全員1にして先頭ラウンドを見る
    const live = toExplaining(start([1, 1, 1, 1, 1, 1] as Level[]));
    const speaker = live.secrets.get(speakerOf(live)) as SpeakerSecret;
    expect(speaker.card.taboo).toHaveLength(3);
    expect(live.publicState.constraint).toBeNull();
  });

  it("レベル5の説明者には5語を渡し、制約は公開状態へ載せる", () => {
    // 制約は秘密ではない。場の全員が見なければ遵守を判定できない（09の3役）
    const live = toExplaining(start([5, 5, 5, 5, 5, 5] as Level[]));
    const speaker = live.secrets.get(speakerOf(live)) as SpeakerSecret;
    expect(speaker.card.taboo).toHaveLength(5);
    expect(live.publicState.constraint).not.toBeNull();
    expect(JSON.stringify(speaker)).not.toContain("constraint");
  });

  it("レベル5でない説明者のラウンドでは制約が載らない", () => {
    const live = toExplaining(start([1, 1, 1, 1, 1, 1] as Level[]));
    expect(live.publicState.constraint).toBeNull();
  });

  it("監視役へ渡す禁止語は説明者へ提示したものと一致する", () => {
    const live = toExplaining(start([1, 1, 1, 1, 1, 5] as Level[]));
    const speaker = live.secrets.get(speakerOf(live)) as SpeakerSecret;
    const watcher = live.secrets.get(watcherOf(live)) as WatcherSecret;
    expect(watcher.taboo).toEqual(speaker.card.taboo);
    expect(watcher.cardId).toBe(speaker.card.cardId);
  });
});

describe("ready", () => {
  it("二重送信を拒否せず、状態も変えない", () => {
    const live = start(SIX);
    const once = send(live, ACTIONS.ready, "p1");
    const twice = send(once, ACTIONS.ready, "p1");
    expect(twice.reject).toBeUndefined();
    expect(twice.publicState.readyPlayerIds).toEqual(["p1"]);
  });

  it("接続中の全員が揃うとhandoffへ進む", () => {
    const live = readyAll(start(SIX));
    expect(live.stage).toBe(STAGES.handoff);
  });
});

describe("startRound", () => {
  it("説明者以外は拒否される", () => {
    const live = readyAll(start(SIX));
    const rejected = send(live, ACTIONS.startRound, watcherOf(live));
    expect(rejected.reject).toEqual({ code: ERROR_CODES.notSpeaker });
    expect(rejected.stage).toBe(STAGES.handoff);
  });

  it("説明者が送るとexplainingへ進み、締切がroundSecondsになる", () => {
    const live = toExplaining(start(SIX));
    expect(live.stage).toBe(STAGES.explaining);
    expect(live.deadlineSeconds).toBe(ROUND_SECONDS.default);
  });
});

describe("claimCorrect", () => {
  it("説明者と正解者の双方に1点入る", () => {
    const live = toExplaining(start(SIX));
    const speaker = speakerOf(live);
    const answerer = answererOf(live);
    const after = send(live, ACTIONS.claimCorrect, speaker, { playerId: answerer, cardId: currentCardId(live) });
    expect(after.publicState.scores.find((entry) => entry.playerId === speaker)?.points).toBe(1);
    expect(after.publicState.scores.find((entry) => entry.playerId === answerer)?.points).toBe(1);
    expect(after.publicState.solvedThisRound).toBe(1);
  });

  it("次のカードが説明者と監視役へ配られる", () => {
    const live = toExplaining(start(SIX));
    const before = currentCardId(live);
    const after = send(live, ACTIONS.claimCorrect, speakerOf(live), {
      playerId: answererOf(live),
      cardId: before,
    });
    expect(after.gameSecret.currentCardId).not.toBe(before);
    const speaker = after.secrets.get(speakerOf(after)) as SpeakerSecret;
    expect(speaker.card.cardId).toBe(after.gameSecret.currentCardId);
    expect(after.gameSecret.usedCardIds).toEqual([before]);
  });

  it("説明者自身を正解者にできない", () => {
    const live = toExplaining(start(SIX));
    const speaker = speakerOf(live);
    const after = send(live, ACTIONS.claimCorrect, speaker, { playerId: speaker, cardId: currentCardId(live) });
    expect(after.reject).toEqual({ code: ERROR_CODES.invalidTarget });
  });

  it("監視役を正解者にできない", () => {
    const live = toExplaining(start(SIX));
    const after = send(live, ACTIONS.claimCorrect, speakerOf(live), {
      playerId: watcherOf(live),
      cardId: currentCardId(live),
    });
    expect(after.reject).toEqual({ code: ERROR_CODES.invalidTarget });
  });

  it("説明者以外の申告を拒否する", () => {
    const live = toExplaining(start(SIX));
    const after = send(live, ACTIONS.claimCorrect, answererOf(live), {
      playerId: answererOf(live),
      cardId: currentCardId(live),
    });
    expect(after.reject).toEqual({ code: ERROR_CODES.notSpeaker });
  });

  it("古いcardIdの申告を拒否し、得点を動かさない", () => {
    const live = toExplaining(start(SIX));
    const after = send(live, ACTIONS.claimCorrect, speakerOf(live), {
      playerId: answererOf(live),
      cardId: "card_ZZZ",
    });
    expect(after.reject).toEqual({ code: ERROR_CODES.staleCard });
    expect(after.publicState.scores.every((entry) => entry.points === 0)).toBe(true);
  });
});

describe("reportViolation", () => {
  it("監視役の申告で説明者が1点減り、回答者の得点は動かない", () => {
    const live = toExplaining(start(SIX));
    const speaker = speakerOf(live);
    const after = send(live, ACTIONS.reportViolation, watcherOf(live), { cardId: currentCardId(live) });
    expect(after.publicState.scores.find((entry) => entry.playerId === speaker)?.points).toBe(-1);
    expect(after.publicState.violatedThisRound).toBe(1);
    expect(after.publicState.scores.filter((entry) => entry.points > 0)).toEqual([]);
  });

  it("監視役以外の申告を拒否する", () => {
    const live = toExplaining(start(SIX));
    const after = send(live, ACTIONS.reportViolation, answererOf(live), { cardId: currentCardId(live) });
    expect(after.reject).toEqual({ code: ERROR_CODES.notWatcher });
  });

  it("カードが次へ進む", () => {
    const live = toExplaining(start(SIX));
    const before = currentCardId(live);
    const after = send(live, ACTIONS.reportViolation, watcherOf(live), { cardId: before });
    expect(after.gameSecret.currentCardId).not.toBe(before);
  });
});

describe("skipCard", () => {
  it("1回目は受理され、得点が動かない", () => {
    const live = toExplaining(start(SIX));
    const after = send(live, ACTIONS.skipCard, speakerOf(live), { cardId: currentCardId(live) });
    expect(after.reject).toBeUndefined();
    expect(after.publicState.skipUsedThisRound).toBe(true);
    expect(after.publicState.scores.every((entry) => entry.points === 0)).toBe(true);
  });

  it("2回目は拒否される", () => {
    const live = toExplaining(start(SIX));
    const once = send(live, ACTIONS.skipCard, speakerOf(live), { cardId: currentCardId(live) });
    const twice = send(once, ACTIONS.skipCard, speakerOf(once), { cardId: currentCardId(once) });
    expect(twice.reject).toEqual({ code: ERROR_CODES.skipUsed });
  });

  it("ラウンドが変わると再び使える", () => {
    const live = toExplaining(start(SIX));
    const used = send(live, ACTIONS.skipCard, speakerOf(live), { cardId: currentCardId(live) });
    const nextRound = fireDeadline(used);
    expect(nextRound.publicState.skipUsedThisRound).toBe(false);
    const started = send(nextRound, ACTIONS.startRound, speakerOf(nextRound));
    const again = send(started, ACTIONS.skipCard, speakerOf(started), { cardId: currentCardId(started) });
    expect(again.reject).toBeUndefined();
  });
});

describe("ラウンドの進行", () => {
  it("explainingの締切でラウンドが集計され、カウンタが戻る", () => {
    const live = toExplaining(start(SIX));
    const solved = send(live, ACTIONS.claimCorrect, speakerOf(live), {
      playerId: answererOf(live),
      cardId: currentCardId(live),
    });
    const after = fireDeadline(solved);
    expect(after.stage).toBe(STAGES.handoff);
    expect(after.publicState.rounds).toHaveLength(1);
    expect(after.publicState.rounds[0]?.solved).toBe(1);
    expect(after.publicState.roundIndex).toBe(1);
    expect(after.publicState.solvedThisRound).toBe(0);
  });

  it("当てられなかったカードは次のラウンドへ持ち越さない", () => {
    const live = toExplaining(start(SIX));
    const carried = currentCardId(live);
    const after = fireDeadline(live);
    expect(after.gameSecret.currentCardId).not.toBe(carried);
    expect(after.gameSecret.usedCardIds).toContain(carried);
  });

  it("役が1つずつずれ、6ラウンドで全員が説明者と監視役を1回務める", () => {
    let live = readyAll(start(SIX));
    const speakers: string[] = [];
    const watchers: string[] = [];
    for (let round = 0; round < 6; round += 1) {
      speakers.push(speakerOf(live));
      watchers.push(watcherOf(live));
      live = send(live, ACTIONS.startRound, speakerOf(live));
      live = fireDeadline(live);
    }
    expect([...speakers].sort()).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect([...watchers].sort()).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(live.stage).toBe(STAGES.debrief);
    expect(live.result).toBeDefined();
  });

  it("交代時に全員へ秘密が送り直され、前の役の内容が残らない", () => {
    const live = toExplaining(start(SIX));
    const firstSpeaker = speakerOf(live);
    const next = fireDeadline(live);
    expect(next.publicState.roundIndex).toBe(1);
    // 1巡目の説明者は2巡目では回答者か監視役になる
    expect((next.secrets.get(firstSpeaker) as DontSayItSecret).role).not.toBe("speaker");
    for (const player of next.players) {
      expect(next.secrets.get(player.id)).toBeDefined();
    }
  });

  it("handoffで説明者が未接続ならそのラウンドを飛ばす", () => {
    const live = readyAll(start(SIX));
    const speaker = speakerOf(live);
    const offline: Live = {
      ...live,
      players: live.players.map((player) => (player.id === speaker ? { ...player, connected: false } : player)),
    };
    const after = fireDeadline(offline);
    expect(after.publicState.roundIndex).toBe(1);
    expect(after.publicState.rounds[0]?.solved).toBe(0);
  });

  it("handoffの締切で説明者が操作しなくてもexplainingへ進む", () => {
    const live = readyAll(start(SIX));
    const after = fireDeadline(live);
    expect(after.stage).toBe(STAGES.explaining);
  });
});

describe("1ラウンドの消費上限", () => {
  // 上限がないと1人の連打で山札が尽き、残りの参加者が説明者を務められないままゲームが終わる
  it("上限に達した時点でラウンドが終わる", () => {
    let live = toExplaining(start(SIX));
    for (let claimed = 1; claimed <= MAX_CARD_ADVANCES_PER_ROUND; claimed += 1) {
      live = send(live, ACTIONS.claimCorrect, speakerOf(live), {
        playerId: answererOf(live),
        cardId: currentCardId(live),
      });
    }
    expect(live.stage).toBe(STAGES.handoff);
    expect(live.publicState.roundIndex).toBe(1);
    expect(live.publicState.rounds[0]?.solved).toBe(MAX_CARD_ADVANCES_PER_ROUND);
    expect(live.gameSecret.usedCardIds).toHaveLength(MAX_CARD_ADVANCES_PER_ROUND);
  });

  it("違反とスキップも上限に数える", () => {
    let live = toExplaining(start(SIX));
    live = send(live, ACTIONS.skipCard, speakerOf(live), { cardId: currentCardId(live) });
    for (let index = 0; index < MAX_CARD_ADVANCES_PER_ROUND - 1; index += 1) {
      live = send(live, ACTIONS.reportViolation, watcherOf(live), { cardId: currentCardId(live) });
    }
    expect(live.stage).toBe(STAGES.handoff);
    expect(live.publicState.rounds[0]?.violated).toBe(MAX_CARD_ADVANCES_PER_ROUND - 1);
    expect(live.publicState.rounds[0]?.skipped).toBe(true);
  });

  it("連打でも1人が全ラウンド分の山札を消費できない", () => {
    // 6人×上限で消費しても、山札の下限（MIN_CARDS）を超えない
    let live = readyAll(start(SIX));
    let claims = 0;
    for (let round = 0; round < 6 && live.result === undefined; round += 1) {
      live = send(live, ACTIONS.startRound, speakerOf(live));
      for (let index = 0; index < MAX_CARD_ADVANCES_PER_ROUND && live.result === undefined; index += 1) {
        live = send(live, ACTIONS.claimCorrect, speakerOf(live), {
          playerId: answererOf(live),
          cardId: currentCardId(live),
        });
        claims += 1;
      }
    }
    expect(claims).toBe(6 * MAX_CARD_ADVANCES_PER_ROUND);
    expect(live.publicState.rounds).toHaveLength(6);
    expect(live.result).toBeDefined();
  });
});

describe("飛ばしたラウンド", () => {
  // handoffで説明者が未接続のとき、そのカードは誰も見ていない（09の結果）
  it("誰も見ていないカードを結果で開示しない", () => {
    const live = readyAll(start(SIX));
    const unseen = currentCardId(live);
    const speaker = speakerOf(live);
    const offline: Live = {
      ...live,
      players: live.players.map((player) => (player.id === speaker ? { ...player, connected: false } : player)),
    };
    const after = fireDeadline(offline);
    expect(after.publicState.roundIndex).toBe(1);
    expect(after.gameSecret.usedCardIds).not.toContain(unseen);
    expect(after.gameSecret.currentCardId).not.toBe(unseen);
  });
});

describe("結果", () => {
  it("使い終えたカードだけを開示し、得点を降順に並べる", () => {
    let live = readyAll(start(SIX));
    for (let round = 0; round < 6; round += 1) {
      live = send(live, ACTIONS.startRound, speakerOf(live));
      live = send(live, ACTIONS.claimCorrect, speakerOf(live), {
        playerId: answererOf(live),
        cardId: currentCardId(live),
      });
      if (live.result !== undefined) {
        break;
      }
      live = fireDeadline(live);
    }
    const result = live.result as DontSayItResult;
    // 最終ラウンドの集計は rounds に入り、進行中のカウンタは戻る（足し合わせる画面が二重計上しない）
    expect(live.publicState.solvedThisRound).toBe(0);
    expect(live.publicState.violatedThisRound).toBe(0);
    expect(result.usedCards.length).toBe(live.gameSecret.usedCardIds.length);
    expect(result.usedCards.length).toBeLessThan(20);
    const points = result.scores.map((entry) => entry.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
    expect(result.keyExpressions.length).toBeGreaterThan(0);
  });
});

describe("validateSettings", () => {
  it("範囲外を拒否する", () => {
    expect(dontSayItModule.validateSettings({ roundSeconds: 30 }).valid).toBe(false);
    expect(dontSayItModule.validateSettings({ roundSeconds: 200 }).valid).toBe(false);
  });

  it("整数でない値を拒否する", () => {
    expect(dontSayItModule.validateSettings({ roundSeconds: 90.5 }).valid).toBe(false);
  });

  it("未指定と範囲内を受け入れる", () => {
    expect(dontSayItModule.validateSettings(undefined).valid).toBe(true);
    expect(dontSayItModule.validateSettings({ roundSeconds: 120 }).valid).toBe(true);
  });
});

describe("カタログ", () => {
  // 記述子と検証がずれると、ロビーで入力できる値がサーバに拒否される
  it("設定の記述子がvalidateSettingsと一致する", () => {
    const fields = dontSayItModule.settingsFields;
    expect(fields).toHaveLength(1);
    const field = fields[0];
    if (field === undefined) {
      throw new Error("設定の記述子がない");
    }
    expect(field.key).toBe("roundSeconds");
    expect(dontSayItModule.validateSettings({ [field.key]: field.default }).valid).toBe(true);
    expect(dontSayItModule.validateSettings({ [field.key]: field.min }).valid).toBe(true);
    expect(dontSayItModule.validateSettings({ [field.key]: field.max }).valid).toBe(true);
    expect(dontSayItModule.validateSettings({ [field.key]: field.min - 1 }).valid).toBe(false);
    expect(dontSayItModule.validateSettings({ [field.key]: field.max + 1 }).valid).toBe(false);
  });

  it("コンテンツ選択の見出しを持つ", () => {
    expect(dontSayItModule.contentLabelJa.length).toBeGreaterThan(0);
  });

  it("tagline・icon・対応人数を持つ", () => {
    expect(dontSayItModule.title).toBe("DON'T SAY IT");
    expect(dontSayItModule.tagline.length).toBeGreaterThan(0);
    expect(dontSayItModule.icon.length).toBeGreaterThan(0);
    expect(dontSayItModule.playerCount).toEqual([5, 6]);
  });
});
