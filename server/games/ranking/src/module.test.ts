// GameModuleの振る舞い。Durable Objectなしで全項目を確かめる（基本設計/10のテスト観点）
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Player, Room } from "@beb/shared-core";
import {
  ACTIONS,
  DISCUSSION_SECONDS,
  ERROR_CODES,
  POINTS_PER_GOAL,
  ROUNDS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  pointsOf,
  type RankingPublic,
  type RankingSecret,
} from "@beb/shared-ranking";
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

const { rankingModule } = await import("./module");

const PACK_ID = "fixture_pack";
const SEED = 4242;

let players: Player[];

beforeEach(() => {
  players = playersOf([1, 2, 3, 4, 5, 5]);
});

function startGame(input: { players?: Player[]; settings?: unknown; seed?: number } = {}) {
  return rankingModule.start({
    players: input.players ?? players,
    contentId: PACK_ID,
    settings: input.settings ?? {},
    seed: input.seed ?? SEED,
  });
}

function roomOf(
  publicState: RankingPublic,
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

/** 全員がreadyを送る。最後の遷移を返す */
function readyAll(publicState: RankingPublic, gameSecret: unknown, stage: string, room?: Room) {
  let state = publicState;
  let last = rankingModule.handleAction({
    room: room ?? roomOf(state, stage),
    publicState: state,
    gameSecret: gameSecret as never,
    playerId: players[0]!.id,
    action: ACTIONS.ready,
    payload: {},
  });
  for (const player of players.slice(1)) {
    state = last.publicState ?? state;
    last = rankingModule.handleAction({
      room: room ?? roomOf(state, stage),
      publicState: state,
      gameSecret: gameSecret as never,
      playerId: player.id,
      action: ACTIONS.ready,
      payload: {},
    });
  }
  return last;
}

describe("start", () => {
  it("briefingから始まり、締切と公開状態が揃う", () => {
    const started = startGame();
    expect(started.stage).toBe(STAGES.briefing);
    expect(started.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.briefing);
    expect(started.publicState.roundIndex).toBe(0);
    expect(started.publicState.totalRounds).toBe(ROUNDS);
    expect(started.publicState.items).toHaveLength(5);
    expect(started.publicState.proposedRanking).toBeNull();
    expect(started.publicState.scores.every((entry) => entry.points === 0)).toBe(true);
  });

  it("同じseedから同じセットと同じ目標の割り当てを返す", () => {
    const a = startGame();
    const b = startGame();
    expect(a.gameSecret?.setIds).toEqual(b.gameSecret?.setIds);
    expect(a.gameSecret?.goalsByRound).toEqual(b.gameSecret?.goalsByRound);
  });

  it("違うseedでは割り当てが変わる", () => {
    const a = startGame({ seed: 1 });
    const b = startGame({ seed: 2 });
    const idsOf = (started: typeof a) =>
      Object.entries(started.gameSecret?.goalsByRound[0] ?? {}).map(([playerId, card]) => `${playerId}:${card.id}`);
    expect(idsOf(a)).not.toEqual(idsOf(b));
  });

  it("全ラウンド分の目標を決める（handleActionにシードが渡らないため）", () => {
    const started = startGame();
    expect(started.gameSecret?.goalsByRound).toHaveLength(ROUNDS);
    for (const round of started.gameSecret?.goalsByRound ?? []) {
      expect(Object.keys(round)).toHaveLength(players.length);
    }
  });

  it("公開状態に目標が現れない", () => {
    const started = startGame();
    const serialized = JSON.stringify(started.publicState);
    for (const card of validPack().sets[0]!.goals) {
      expect(serialized).not.toContain(card.ja);
      expect(serialized).not.toContain(card.id);
    }
  });

  it("使うセットのidを公開状態に載せない", () => {
    const started = startGame();
    const serialized = JSON.stringify(started.publicState);
    for (const setId of started.gameSecret?.setIds ?? []) {
      expect(serialized).not.toContain(setId);
    }
  });

  it("設定の議論秒数を公開状態に持つ", () => {
    expect(startGame({ settings: { discussionSeconds: 180 } }).publicState.discussionSeconds).toBe(180);
    expect(startGame({ settings: {} }).publicState.discussionSeconds).toBe(DISCUSSION_SECONDS.default);
  });
});

describe("目標の割り当て", () => {
  it("レベルの昇順と難度の昇順が対応する", () => {
    const started = startGame({ players: playersOf([1, 2, 3, 4, 5, 5]) });
    const goals = started.gameSecret?.goalsByRound[0] ?? {};
    const byLevel = [...players].sort((a, b) => a.level - b.level);
    const difficulties = byLevel.map((player) => goals[player.id]?.difficulty);
    expect(difficulties).toEqual([...difficulties].sort());
  });

  it("5人のとき難度3が1枚落ちて5枚配られる", () => {
    const five = playersOf([1, 2, 3, 4, 5]);
    const started = startGame({ players: five });
    const goals = started.gameSecret?.goalsByRound[0] ?? {};
    expect(Object.keys(goals)).toHaveLength(5);
    const difficulties = Object.values(goals).map((card) => card.difficulty).sort();
    expect(difficulties).toEqual([1, 1, 2, 2, 3]);
  });

  it("配る目標のidが重複しない", () => {
    const started = startGame();
    for (const round of started.gameSecret?.goalsByRound ?? []) {
      const ids = Object.values(round).map((card) => card.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("秘密情報", () => {
  it("各自に自分の目標だけが届く", () => {
    const started = startGame();
    const goals = started.gameSecret?.goalsByRound[0] ?? {};
    for (const player of players) {
      const secret = started.secrets.get(player.id) as RankingSecret;
      expect(secret.goal.id).toBe(goals[player.id]?.id);
      expect(secret.roundIndex).toBe(0);
    }
  });

  it("レベル1〜2へhintEnが3件、レベル3以上へ1件", () => {
    const started = startGame({ players: playersOf([1, 2, 3, 4, 5, 5]) });
    const hintsOf = (playerId: string) => (started.secrets.get(playerId) as RankingSecret).goal.hintEn.length;
    expect(hintsOf("p1")).toBe(3);
    expect(hintsOf("p2")).toBe(3);
    expect(hintsOf("p3")).toBe(1);
    expect(hintsOf("p6")).toBe(1);
  });
});

describe("ready", () => {
  it("全員揃うとdiscussionへ進み、締切が議論秒数になる", () => {
    const started = startGame({ settings: { discussionSeconds: 150 } });
    const transition = readyAll(started.publicState, started.gameSecret, STAGES.briefing);
    expect(transition.stage).toBe(STAGES.discussion);
    expect(transition.deadlineSeconds).toBe(150);
  });

  it("揃うまでは遷移しない", () => {
    const started = startGame();
    const transition = rankingModule.handleAction({
      room: roomOf(started.publicState, STAGES.briefing),
      publicState: started.publicState,
      gameSecret: started.gameSecret,
      playerId: players[0]!.id,
      action: ACTIONS.ready,
      payload: {},
    });
    expect(transition.stage).toBeUndefined();
    expect(transition.publicState?.readyPlayerIds).toEqual([players[0]!.id]);
  });

  it("二重送信が冪等である", () => {
    const started = startGame();
    const room = roomOf(started.publicState, STAGES.briefing);
    const once = rankingModule.handleAction({
      room,
      publicState: started.publicState,
      gameSecret: started.gameSecret,
      playerId: players[0]!.id,
      action: ACTIONS.ready,
      payload: {},
    });
    const twice = rankingModule.handleAction({
      room,
      publicState: once.publicState!,
      gameSecret: started.gameSecret,
      playerId: players[0]!.id,
      action: ACTIONS.ready,
      payload: {},
    });
    expect(twice.publicState?.readyPlayerIds).toEqual([players[0]!.id]);
  });

  it("未接続者を待たずに進む", () => {
    const started = startGame();
    const room = roomOf(started.publicState, STAGES.briefing, { disconnected: ["p6"] });
    let state = started.publicState;
    let last = rankingModule.handleAction({
      room,
      publicState: state,
      gameSecret: started.gameSecret,
      playerId: "p1",
      action: ACTIONS.ready,
      payload: {},
    });
    for (const playerId of ["p2", "p3", "p4", "p5"]) {
      state = last.publicState ?? state;
      last = rankingModule.handleAction({
        room,
        publicState: state,
        gameSecret: started.gameSecret,
        playerId,
        action: ACTIONS.ready,
        payload: {},
      });
    }
    expect(last.stage).toBe(STAGES.discussion);
  });

  it("ステージ違いを拒否する", () => {
    const started = startGame();
    const transition = rankingModule.handleAction({
      room: roomOf(started.publicState, STAGES.discussion),
      publicState: started.publicState,
      gameSecret: started.gameSecret,
      playerId: players[0]!.id,
      action: ACTIONS.ready,
      payload: {},
    });
    expect(transition.reject?.code).toBe(ERROR_CODES.invalidStage);
  });
});

describe("proposeRanking", () => {
  function confirmingState() {
    const started = startGame();
    return { publicState: started.publicState, gameSecret: started.gameSecret };
  }

  function propose(playerId: string, ranking: unknown) {
    const { publicState, gameSecret } = confirmingState();
    return rankingModule.handleAction({
      room: roomOf(publicState, STAGES.confirming),
      publicState,
      gameSecret,
      playerId,
      action: ACTIONS.proposeRanking,
      payload: { ranking },
    });
  }

  it("ホストの提案を受理して公開状態に載せる", () => {
    const transition = propose("p1", ["a", "b", "c", "d", "e"]);
    expect(transition.publicState?.proposedRanking).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("ホスト以外を拒否する", () => {
    expect(propose("p2", ["a", "b", "c", "d", "e"]).reject?.code).toBe(ERROR_CODES.notHost);
  });

  it("要素数が5でないものを拒否する", () => {
    expect(propose("p1", ["a", "b", "c", "d"]).reject?.code).toBe(ERROR_CODES.invalidRanking);
    expect(propose("p1", ["a", "b", "c", "d", "e", "a"]).reject?.code).toBe(ERROR_CODES.invalidRanking);
  });

  it("未知のidを拒否する", () => {
    expect(propose("p1", ["a", "b", "c", "d", "zzz"]).reject?.code).toBe(ERROR_CODES.invalidRanking);
  });

  it("重複を拒否する", () => {
    expect(propose("p1", ["a", "a", "c", "d", "e"]).reject?.code).toBe(ERROR_CODES.invalidRanking);
  });

  it("文字列でないペイロードを拒否する", () => {
    expect(propose("p1", "abcde").reject?.code).toBe(ERROR_CODES.invalidRanking);
    expect(propose("p1", [1, 2, 3, 4, 5]).reject?.code).toBe(ERROR_CODES.invalidRanking);
  });

  it("差し替えで承認が取り消される", () => {
    const { publicState, gameSecret } = confirmingState();
    const withApproval: RankingPublic = {
      ...publicState,
      proposedRanking: ["a", "b", "c", "d", "e"],
      approvedPlayerIds: ["p2", "p3"],
    };
    const transition = rankingModule.handleAction({
      room: roomOf(withApproval, STAGES.confirming),
      publicState: withApproval,
      gameSecret,
      playerId: "p1",
      action: ACTIONS.proposeRanking,
      payload: { ranking: ["e", "d", "c", "b", "a"] },
    });
    expect(transition.publicState?.approvedPlayerIds).toEqual([]);
    expect(transition.publicState?.proposedRanking).toEqual(["e", "d", "c", "b", "a"]);
  });
});

describe("approveRanking", () => {
  function proposed(ranking: string[] = ["b", "a", "c", "d", "e"]) {
    const started = startGame();
    const publicState: RankingPublic = { ...started.publicState, proposedRanking: ranking };
    return { publicState, gameSecret: started.gameSecret };
  }

  function approveAll(input: ReturnType<typeof proposed>, ids: string[] = players.map((player) => player.id)) {
    let state = input.publicState;
    let last = rankingModule.handleAction({
      room: roomOf(state, STAGES.confirming),
      publicState: state,
      gameSecret: input.gameSecret,
      playerId: ids[0]!,
      action: ACTIONS.approveRanking,
      payload: {},
    });
    for (const playerId of ids.slice(1)) {
      state = last.publicState ?? state;
      last = rankingModule.handleAction({
        room: roomOf(state, STAGES.confirming),
        publicState: state,
        gameSecret: input.gameSecret,
        playerId,
        action: ACTIONS.approveRanking,
        payload: {},
      });
    }
    return last;
  }

  it("提案が無い状態を拒否する", () => {
    const started = startGame();
    const transition = rankingModule.handleAction({
      room: roomOf(started.publicState, STAGES.confirming),
      publicState: started.publicState,
      gameSecret: started.gameSecret,
      playerId: "p1",
      action: ACTIONS.approveRanking,
      payload: {},
    });
    expect(transition.reject?.code).toBe(ERROR_CODES.noProposal);
  });

  it("二重送信が冪等である", () => {
    const input = proposed();
    const once = approveAll(input, ["p1"]);
    const twice = rankingModule.handleAction({
      room: roomOf(once.publicState!, STAGES.confirming),
      publicState: once.publicState!,
      gameSecret: input.gameSecret,
      playerId: "p1",
      action: ACTIONS.approveRanking,
      payload: {},
    });
    expect(twice.publicState?.approvedPlayerIds).toEqual(["p1"]);
  });

  it("全員承認でrevealへ進み、記録が1件増える", () => {
    const transition = approveAll(proposed());
    expect(transition.stage).toBe(STAGES.reveal);
    expect(transition.publicState?.rounds).toHaveLength(1);
    expect(transition.publicState?.rounds[0]?.ranking).toEqual(["b", "a", "c", "d", "e"]);
  });

  it("達成した人だけに2点入る", () => {
    // b=1位, a=2位, c=3位, d=4位, e=5位
    // 成立するのは g2(c>d) / g3(b top1) / g4(e bottom1) / g5(c exact3) の4枚
    const input = proposed(["b", "a", "c", "d", "e"]);
    const transition = approveAll(input);
    const goals = input.gameSecret!.goalsByRound[0]!;
    const achievedIds = new Set(["g2", "g3", "g4", "g5"]);
    for (const player of players) {
      const expected = achievedIds.has(goals[player.id]!.id) ? POINTS_PER_GOAL : 0;
      expect(pointsOf(transition.publicState!.scores, player.id)).toBe(expected);
    }
  });

  it("全員の目標が達成の可否つきで開示される", () => {
    const transition = approveAll(proposed());
    const revealed = transition.publicState?.rounds[0]?.goals ?? [];
    expect(revealed).toHaveLength(players.length);
    expect(revealed.some((entry) => entry.achieved)).toBe(true);
    expect(revealed.every((entry) => entry.ja.length > 0)).toBe(true);
  });

  it("未接続者の承認を待たずに確定する", () => {
    const input = proposed();
    const room = roomOf(input.publicState, STAGES.confirming, { disconnected: ["p5", "p6"] });
    let state = input.publicState;
    let last = rankingModule.handleAction({
      room,
      publicState: state,
      gameSecret: input.gameSecret,
      playerId: "p1",
      action: ACTIONS.approveRanking,
      payload: {},
    });
    for (const playerId of ["p2", "p3", "p4"]) {
      state = last.publicState ?? state;
      last = rankingModule.handleAction({
        room,
        publicState: state,
        gameSecret: input.gameSecret,
        playerId,
        action: ACTIONS.approveRanking,
        payload: {},
      });
    }
    expect(last.stage).toBe(STAGES.reveal);
  });
});

describe("onDeadline", () => {
  it("briefingは未readyを既読扱いにしてdiscussionへ進む", () => {
    const started = startGame();
    const transition = rankingModule.onDeadline({
      room: roomOf(started.publicState, STAGES.briefing),
      publicState: started.publicState,
      gameSecret: started.gameSecret,
    });
    expect(transition.stage).toBe(STAGES.discussion);
    expect(transition.publicState?.readyPlayerIds).toHaveLength(players.length);
  });

  it("discussionはconfirmingへ進む", () => {
    const started = startGame();
    const transition = rankingModule.onDeadline({
      room: roomOf(started.publicState, STAGES.discussion),
      publicState: started.publicState,
      gameSecret: started.gameSecret,
    });
    expect(transition.stage).toBe(STAGES.confirming);
    expect(transition.deadlineSeconds).toBe(STAGE_DEADLINE_SECONDS.confirming);
  });

  it("confirmingは提案があればそれで確定する", () => {
    const started = startGame();
    const publicState: RankingPublic = { ...started.publicState, proposedRanking: ["e", "d", "c", "b", "a"] };
    const transition = rankingModule.onDeadline({
      room: roomOf(publicState, STAGES.confirming),
      publicState,
      gameSecret: started.gameSecret,
    });
    expect(transition.publicState?.rounds[0]?.ranking).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("confirmingは提案が無ければ項目の定義順で確定する", () => {
    const started = startGame();
    const transition = rankingModule.onDeadline({
      room: roomOf(started.publicState, STAGES.confirming),
      publicState: started.publicState,
      gameSecret: started.gameSecret,
    });
    expect(transition.publicState?.rounds[0]?.ranking).toEqual(started.publicState.items.map((item) => item.id));
  });

  it("revealは次のラウンドのbriefingへ進み、目標を配り直す", () => {
    const started = startGame();
    const confirmed = rankingModule.onDeadline({
      room: roomOf(started.publicState, STAGES.confirming),
      publicState: started.publicState,
      gameSecret: started.gameSecret,
    });
    const transition = rankingModule.onDeadline({
      room: roomOf(confirmed.publicState!, STAGES.reveal),
      publicState: confirmed.publicState!,
      gameSecret: started.gameSecret,
    });
    expect(transition.stage).toBe(STAGES.briefing);
    expect(transition.publicState?.roundIndex).toBe(1);
    expect(transition.publicState?.proposedRanking).toBeNull();
    expect(transition.publicState?.readyPlayerIds).toEqual([]);
    // 全員へ送り直す。前のラウンドの目標が手元に残らないようにする
    expect(transition.secrets?.size).toBe(players.length);
    for (const player of players) {
      const secret = transition.secrets?.get(player.id) as RankingSecret;
      expect(secret.roundIndex).toBe(1);
      expect(secret.goal.id).toBe(started.gameSecret?.goalsByRound[1]?.[player.id]?.id);
    }
  });
});

describe("3ラウンドの通し", () => {
  /** 締切だけで最後まで進める。提案が無い場合の経路も同時に通す */
  function playThrough(startedInput = startGame()) {
    let publicState = startedInput.publicState;
    const gameSecret = startedInput.gameSecret;
    const transitions = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const stage of [STAGES.briefing, STAGES.discussion, STAGES.confirming, STAGES.reveal]) {
        if (stage === STAGES.reveal && round === ROUNDS - 1) {
          break;
        }
        const transition = rankingModule.onDeadline({
          room: roomOf(publicState, stage),
          publicState,
          gameSecret,
        });
        publicState = transition.publicState ?? publicState;
        transitions.push(transition);
      }
    }
    return { publicState, transitions };
  }

  it("最終ラウンドの確定でresultが返る", () => {
    const { transitions } = playThrough();
    const withResult = transitions.filter((transition) => transition.result !== undefined);
    expect(withResult).toHaveLength(1);
    expect(withResult[0]?.result?.rounds).toHaveLength(ROUNDS);
  });

  it("resultのscoresが降順である", () => {
    const { transitions } = playThrough();
    const result = transitions.find((transition) => transition.result !== undefined)?.result;
    const points = result?.scores.map((entry) => entry.points) ?? [];
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("3ラウンドで違うセットを使う", () => {
    const { publicState } = playThrough();
    const setIds = publicState.rounds.map((round) => round.setId);
    expect(new Set(setIds).size).toBe(ROUNDS);
  });

  it("得点は0からラウンド数×2点の範囲に収まる", () => {
    const { publicState } = playThrough();
    for (const entry of publicState.scores) {
      expect(entry.points).toBeGreaterThanOrEqual(0);
      expect(entry.points).toBeLessThanOrEqual(ROUNDS * POINTS_PER_GOAL);
    }
  });

  it("5人でも最後まで進む", () => {
    players = playersOf([1, 2, 3, 4, 5]);
    const { transitions } = playThrough(startGame({ players }));
    expect(transitions.some((transition) => transition.result !== undefined)).toBe(true);
  });
});

describe("validateSettings", () => {
  it("記述子のminとmaxが受理範囲と一致する", () => {
    const field = rankingModule.settingsFields[0]!;
    expect(field.key).toBe("discussionSeconds");
    expect(rankingModule.validateSettings({ discussionSeconds: field.min }).valid).toBe(true);
    expect(rankingModule.validateSettings({ discussionSeconds: field.max }).valid).toBe(true);
    expect(rankingModule.validateSettings({ discussionSeconds: field.min - 1 }).valid).toBe(false);
    expect(rankingModule.validateSettings({ discussionSeconds: field.max + 1 }).valid).toBe(false);
  });

  it("整数以外と型違いを拒否する", () => {
    expect(rankingModule.validateSettings({ discussionSeconds: 90.5 }).valid).toBe(false);
    expect(rankingModule.validateSettings({ discussionSeconds: "120" }).valid).toBe(false);
    expect(rankingModule.validateSettings("nope").valid).toBe(false);
  });

  it("欠損と未指定は既定値で通す", () => {
    expect(rankingModule.validateSettings({}).valid).toBe(true);
    expect(rankingModule.validateSettings(undefined).valid).toBe(true);
  });
});

describe("listContents", () => {
  it("項目・目標・日本語文を含めない", () => {
    const serialized = JSON.stringify(rankingModule.listContents());
    for (const card of validPack().sets[0]!.goals) {
      expect(serialized).not.toContain(card.ja);
    }
    for (const item of validPack().sets[0]!.items) {
      expect(serialized).not.toContain(item.en);
    }
    expect(serialized).not.toContain("question");
  });
});
