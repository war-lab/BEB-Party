// 山札が尽きる経路のテスト。小さい山札を差し込むため、モジュールテスト本体とはファイルを分ける
// （vi.mock はファイル単位で効くため）。
//
// 山札の下限（MIN_CARDS）は通常のプレイで枯渇が起きないよう決めているが、
// 枯渇したときに詰まらないことは別に固定する（基本設計/09のステージ）。
import { describe, expect, it, vi } from "vitest";
import type { Level, Player, Room } from "@beb/shared-core";
import {
  ACTIONS,
  MAX_CARD_ADVANCES_PER_ROUND,
  STAGES,
  type DontSayItPublic,
  type DontSayItResult,
  type DontSayItSecret,
} from "@beb/shared-dontsayit";

const DECK_SIZE = 3;

vi.mock("./sets", async () => {
  const { validSet } = await import("./test-support/fixtures");
  const target = validSet(3);
  return {
    SETS: [target],
    findSet: (setId: string) => (setId === target.id ? target : undefined),
    summarize: () => ({ id: target.id, title: target.title, cardCount: target.cards.length }),
  };
});

const { dontSayItModule } = await import("./module");
type GameSecret = import("./module").DontSayItGameSecret;

const SET_ID = "fixture_set_v1";
const SIX = [1, 2, 3, 3, 4, 5] as Level[];

interface Live {
  players: Player[];
  stage: string;
  publicState: DontSayItPublic;
  gameSecret: GameSecret;
  result?: DontSayItResult;
}

function start(): Live {
  const players: Player[] = SIX.map((level, index) => ({
    id: `p${index + 1}`,
    name: `Player${index + 1}`,
    level,
    connected: true,
    isHost: index === 0,
  }));
  const started = dontSayItModule.start({ players, contentId: SET_ID, settings: undefined, seed: 7 });
  return {
    players,
    stage: started.stage,
    publicState: started.publicState,
    gameSecret: started.gameSecret as GameSecret,
  };
}

function apply(live: Live, transition: ReturnType<typeof dontSayItModule.handleAction>): Live {
  if (transition.reject !== undefined) {
    return live;
  }
  return {
    ...live,
    stage: transition.stage ?? live.stage,
    publicState: transition.publicState ?? live.publicState,
    gameSecret: (transition.gameSecret ?? live.gameSecret) as GameSecret,
    result: transition.result ?? live.result,
  };
}

function send(live: Live, action: string, playerId: string, payload?: unknown): Live {
  const room: Room = {
    code: "AB12",
    lifecycle: "playing",
    players: live.players,
    gameId: "g",
    contentId: SET_ID,
    stage: live.stage,
  };
  return apply(
    live,
    dontSayItModule.handleAction({
      room,
      publicState: live.publicState,
      gameSecret: live.gameSecret,
      playerId,
      action,
      payload,
    }),
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

function toExplaining(live: Live): Live {
  const ready = live.players.reduce((acc, player) => send(acc, ACTIONS.ready, player.id), live);
  return send(ready, ACTIONS.startRound, speakerOf(ready));
}

describe("山札の枯渇", () => {
  it("消費上限に達する前に尽きたらゲームが終わる", () => {
    expect(DECK_SIZE).toBeLessThan(MAX_CARD_ADVANCES_PER_ROUND);
    let live = toExplaining(start());
    for (let index = 0; index < DECK_SIZE; index += 1) {
      live = send(live, ACTIONS.claimCorrect, speakerOf(live), {
        playerId: answererOf(live),
        cardId: live.gameSecret.currentCardId,
      });
    }
    expect(live.stage).toBe(STAGES.debrief);
    expect(live.result).toBeDefined();
    expect(live.gameSecret.currentCardId).toBeNull();
  });

  it("尽きた時点で残りのラウンドがあっても終わる", () => {
    let live = toExplaining(start());
    for (let index = 0; index < DECK_SIZE; index += 1) {
      live = send(live, ACTIONS.claimCorrect, speakerOf(live), {
        playerId: answererOf(live),
        cardId: live.gameSecret.currentCardId,
      });
    }
    // 6人ぶんのラウンドを回しきっていない
    expect(live.publicState.roundIndex).toBe(0);
    expect(live.publicState.rounds).toHaveLength(1);
  });

  it("使い切ったカードだけが結果に載る", () => {
    let live = toExplaining(start());
    for (let index = 0; index < DECK_SIZE; index += 1) {
      live = send(live, ACTIONS.claimCorrect, speakerOf(live), {
        playerId: answererOf(live),
        cardId: live.gameSecret.currentCardId,
      });
    }
    const result = live.result as DontSayItResult;
    expect(result.usedCards).toHaveLength(DECK_SIZE);
    expect(live.gameSecret.usedCardIds).toHaveLength(DECK_SIZE);
  });

  it("終局時に進行中のカウンタが戻る", () => {
    // rounds と足し合わせて集計する画面が、最終ラウンドを二重に数えないため（基本設計/09）
    let live = toExplaining(start());
    live = send(live, ACTIONS.reportViolation, watcherOf(live), { cardId: live.gameSecret.currentCardId });
    for (let index = 0; index < DECK_SIZE - 1; index += 1) {
      live = send(live, ACTIONS.claimCorrect, speakerOf(live), {
        playerId: answererOf(live),
        cardId: live.gameSecret.currentCardId,
      });
    }
    expect(live.result).toBeDefined();
    expect(live.publicState.solvedThisRound).toBe(0);
    expect(live.publicState.violatedThisRound).toBe(0);
    expect(live.publicState.skipUsedThisRound).toBe(false);
    // 集計そのものは rounds へ移っている
    expect(live.publicState.rounds[0]?.violated).toBe(1);
  });

  it("終局後の操作は受理されない", () => {
    let live = toExplaining(start());
    for (let index = 0; index < DECK_SIZE; index += 1) {
      live = send(live, ACTIONS.claimCorrect, speakerOf(live), {
        playerId: answererOf(live),
        cardId: live.gameSecret.currentCardId,
      });
    }
    const scores = JSON.stringify(live.publicState.scores);
    const after = send(live, ACTIONS.claimCorrect, speakerOf(live), {
      playerId: answererOf(live),
      cardId: "card_A",
    });
    expect(JSON.stringify(after.publicState.scores)).toBe(scores);
  });

  it("秘密には配り終えたカードが残らない", () => {
    const live = toExplaining(start());
    const secrets = dontSayItModule.start({
      players: live.players,
      contentId: SET_ID,
      settings: undefined,
      seed: 7,
    }).secrets;
    for (const [, payload] of secrets) {
      expect((payload as DontSayItSecret).role).toBeDefined();
    }
  });
});
