// 別名（aliases）の配り方だけを見るテスト。
//
// 別名はレベルに関係なく全件を配る（基本設計/09の言えない語の範囲）。
// レベルで提示数を変えると、レベル1〜2だけが「言ってよい別名」を持つことになり、
// 正解として受理する語を説明者が言って成立させられる。
//
// module.test.ts のフィクスチャは別名を持たないため、別名を持つセットを別途モックする。
import { describe, expect, it, vi } from "vitest";
import { fallbackPlayerIconId, type Level, type Player } from "@beb/shared-core";
import { ACTIONS, type SpeakerSecret, type WatcherSecret } from "@beb/shared-dontsayit";

const ALIASES = ["fridge", "icebox"];

vi.mock("./sets", async () => {
  const { validSet } = await import("./test-support/fixtures");
  const target = validSet(36);
  // 全カードへ同じ別名を載せる。どのカードを引いても配り方を確かめられるようにする
  for (const card of target.cards) {
    card.aliases = ["fridge", "icebox"];
  }
  return {
    SETS: [target],
    findSet: (setId: string) => (setId === target.id ? target : undefined),
    summarize: () => ({ id: target.id, title: target.title, cardCount: target.cards.length }),
  };
});

const { dontSayItModule } = await import("./module");

const SET_ID = "fixture_set_v1";
const SEED = 4242;

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

/** 全員のレベルをそろえた卓で explaining まで進め、説明者と監視役の秘密を返す */
function secretsAtExplaining(level: Level): { speaker: SpeakerSecret; watcher: WatcherSecret } {
  const players = makePlayers([level, level, level, level, level, level]);
  const room = {
    code: "AB12",
    lifecycle: "playing" as const,
    players,
    gameId: "g",
    contentId: SET_ID,
    stage: "briefing",
  };
  const started = dontSayItModule.start({ players, contentId: SET_ID, settings: undefined, seed: SEED });

  let publicState = started.publicState;
  let gameSecret = started.gameSecret;
  let secrets = started.secrets;
  let stage = started.stage;

  const send = (type: string, playerId: string): void => {
    const transition = dontSayItModule.handleAction({
      room: { ...room, stage },
      publicState,
      gameSecret,
      playerId,
      action: type,
      payload: undefined,
    });
    if (transition.reject !== undefined) {
      throw new Error(`拒否された: ${transition.reject.code}`);
    }
    publicState = transition.publicState ?? publicState;
    gameSecret = transition.gameSecret ?? gameSecret;
    stage = transition.stage ?? stage;
    for (const [id, secret] of transition.secrets ?? new Map()) {
      secrets = new Map(secrets).set(id, secret);
    }
  };

  for (const player of players) {
    send(ACTIONS.ready, player.id);
  }
  const speakerId = publicState.speakerOrder[publicState.roundIndex] as string;
  send(ACTIONS.startRound, speakerId);

  const watcherId = publicState.speakerOrder[(publicState.roundIndex + 1) % publicState.speakerOrder.length] as string;
  return {
    speaker: secrets.get(speakerId) as SpeakerSecret,
    watcher: secrets.get(watcherId) as WatcherSecret,
  };
}

describe("別名の配り方", () => {
  it("レベル1の説明者にも全件を配る", () => {
    const { speaker } = secretsAtExplaining(1);
    expect(speaker.card.aliases).toEqual(ALIASES);
  });

  it("レベル5の説明者にも同じ件数を配る", () => {
    const level1 = secretsAtExplaining(1);
    const level5 = secretsAtExplaining(5);
    expect(level5.speaker.card.aliases).toEqual(level1.speaker.card.aliases);
  });

  it("提示する禁止語の数はレベルで変わる（別名との対比）", () => {
    // 禁止語は3語→10語と変わるのに対し、別名は変わらないことを同じ卓で示す
    expect(secretsAtExplaining(1).speaker.card.taboo).toHaveLength(3);
    expect(secretsAtExplaining(5).speaker.card.taboo).toHaveLength(10);
  });

  it("監視役にも全件を配る", () => {
    const { watcher } = secretsAtExplaining(3);
    expect(watcher.aliases).toEqual(ALIASES);
  });

  it("回答者には配らない", () => {
    const players = makePlayers([1, 1, 1, 1, 1, 1]);
    const started = dontSayItModule.start({ players, contentId: SET_ID, settings: undefined, seed: SEED });
    const answerers = [...started.secrets.values()].filter((secret) => secret.role === "answerer");
    expect(answerers.length).toBeGreaterThan(0);
    for (const secret of answerers) {
      expect(secret).toEqual({ role: "answerer" });
    }
  });
});
