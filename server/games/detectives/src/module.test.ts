// DETECTIVESのGameModuleは純粋関数のため、Durable Objectなしで全項目をテストする（基本設計/08）
import { describe, expect, it } from "vitest";
import type { Level, Player, Room } from "@beb/shared-core";
import {
  RANDOM_CASE_ID,
  STAGES,
  type DetectivesPublic,
  type DetectivesResult,
  type DetectivesSecret,
} from "@beb/shared-detectives";
import { CASES } from "./cases";
import { detectivesModule, type DetectivesGameSecret } from "./module";

const CASE_ID = "cafe_theft_v1";
const SEED = 12345;

function makePlayers(levels: Level[]): Player[] {
  return levels.map((level, index) => ({
    id: `p${index + 1}`,
    name: `Player${index + 1}`,
    level,
    connected: true,
    isHost: index === 0,
  }));
}

function makeRoom(players: Player[], stage: string): Room {
  return { code: "AB12", lifecycle: "playing", players, gameId: "g", contentId: CASE_ID, stage };
}

interface Started {
  players: Player[];
  publicState: DetectivesPublic;
  secrets: Map<string, DetectivesSecret>;
  gameSecret: DetectivesGameSecret;
}

function start(levels: Level[], seed = SEED, settings: unknown = undefined): Started {
  const players = makePlayers(levels);
  const result = detectivesModule.start({ players, contentId: CASE_ID, settings, seed });
  return {
    players,
    publicState: result.publicState,
    secrets: result.secrets,
    gameSecret: result.gameSecret as DetectivesGameSecret,
  };
}

const SIX = [5, 4, 3, 3, 2, 1] as Level[];

describe("start: 配役と秘密情報", () => {
  // 受入条件1
  it("同じseedと同じ参加者から、同じ配役・同じ犯人・同じ秘密情報が得られる", () => {
    const first = start(SIX);
    const second = start(SIX);
    expect(second.publicState).toEqual(first.publicState);
    expect(second.gameSecret).toEqual(first.gameSecret);
    expect([...second.secrets.entries()]).toEqual([...first.secrets.entries()]);
  });

  it("seedが変わると配役か犯人が変わりうる（乱数がseedに依存している）", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => start(SIX, seed));
    const distinct = new Set(seeds.map((entry) => JSON.stringify(entry.publicState.cast)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("参加者をレベル降順、キャラクターをrecommendedLevel降順に対応させる", () => {
    const { publicState, players } = start(SIX);
    const target = CASES.find((entry) => entry.id === CASE_ID)!;
    const levelOfPlayer = new Map(players.map((player) => [player.id, player.level]));

    for (const entry of publicState.cast) {
      const character = target.characters.find((c) => c.id === entry.characterId)!;
      const playerLevel = levelOfPlayer.get(entry.playerId)!;
      // レベル順の対応なので、順位が同じもの同士が組む。順位の逆転がないことを見る
      const higherPlayers = players.filter((p) => p.level > playerLevel).length;
      const higherCharacters = target.characters.filter((c) => c.recommendedLevel > character.recommendedLevel).length;
      expect(Math.abs(higherPlayers - higherCharacters)).toBeLessThanOrEqual(2);
    }
  });

  // 受入条件2
  it("5人時にmerge5pで統合されたキャラクターへ配役されない", () => {
    const { publicState, secrets } = start([5, 4, 3, 2, 1]);
    const target = CASES.find((entry) => entry.id === CASE_ID)!;
    const mergedAway = target.characters.filter((c) => c.merge5p !== null).map((c) => c.id);

    expect(mergedAway.length).toBeGreaterThan(0);
    expect(publicState.cast).toHaveLength(5);
    for (const entry of publicState.cast) {
      expect(mergedAway).not.toContain(entry.characterId);
    }
    // 統合されたキャラクターの証言は統合先の手札に入る
    const merged = target.characters.find((c) => c.merge5p !== null)!;
    const mergedFactIds = target.facts.filter((f) => f.owner === merged.id).map((f) => f.id);
    const targetCharacterId = merged.merge5p!;
    const holder = publicState.cast.find((entry) => entry.characterId === targetCharacterId)!;
    const heldFactIds = secrets.get(holder.playerId)!.cards.map((card) => card.factId);
    for (const factId of mergedFactIds) {
      expect(heldFactIds).toContain(factId);
    }
  });

  // 受入条件3
  it("全員がレベル1〜2の組では、最もレベルが高いプレイヤーが犯人になる", () => {
    const { publicState, gameSecret } = start([2, 1, 1, 1, 1, 1]);
    const topPlayerId = publicState.cast.find((entry) => entry.playerId === "p1")!.playerId;
    expect(gameSecret.culpritPlayerId).toBe(topPlayerId);
  });

  it("最高レベルのプレイヤーが複数いる場合、その中から抽選する（初級者だけの組でも犯人が固定されない）", () => {
    // 先頭固定にすると、初級者だけの組で毎回同じ犯人・同じ嘘になる
    const culprits = new Set(
      Array.from({ length: 60 }, (_, index) => start([2, 2, 1, 1, 1, 1], index + 1).gameSecret.culpritCharacterId),
    );
    expect(culprits.size).toBeGreaterThan(1);

    // 抽選対象は最高レベル（この組では2）のプレイヤーに配役されたキャラクターに限る
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { players, gameSecret } = start([2, 2, 1, 1, 1, 1], seed);
      const culpritLevel = players.find((player) => player.id === gameSecret.culpritPlayerId)!.level;
      expect(culpritLevel).toBe(2);
    }
  });

  it("レベル3以上のプレイヤーが居る場合、犯人はその中から選ばれる", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { players, gameSecret } = start(SIX, seed);
      const culpritLevel = players.find((player) => player.id === gameSecret.culpritPlayerId)!.level;
      expect(culpritLevel).toBeGreaterThanOrEqual(3);
    }
  });

  // 受入条件4
  it("publicStateにisCulprit・証言テキスト・投票先が現れない", () => {
    const { publicState, secrets } = start(SIX);
    const serialized = JSON.stringify(publicState);
    expect(serialized).not.toContain("isCulprit");
    expect(serialized).not.toContain("isLie");
    expect(serialized).not.toContain("targetPlayerId");
    for (const secret of secrets.values()) {
      for (const card of secret.cards) {
        expect(serialized).not.toContain(card.textEn);
      }
    }
  });

  // 受入条件5
  it("犯人以外のcardsにisLie: trueが存在しない", () => {
    const { secrets, gameSecret } = start(SIX);
    let culpritLieCards = 0;
    for (const [playerId, secret] of secrets) {
      const lies = secret.cards.filter((card) => card.isLie);
      if (playerId === gameSecret.culpritPlayerId) {
        culpritLieCards = lies.length;
        expect(secret.isCulprit).toBe(true);
      } else {
        expect(lies).toEqual([]);
        expect(secret.isCulprit).toBe(false);
      }
    }
    expect(culpritLieCards).toBe(1);
  });

  it("各プレイヤーの証言カードが自分のキャラクターの事実だけで構成される", () => {
    const { secrets, publicState } = start(SIX);
    const target = CASES.find((entry) => entry.id === CASE_ID)!;
    for (const entry of publicState.cast) {
      const secret = secrets.get(entry.playerId)!;
      const ownFactIds = target.facts.filter((f) => f.owner === entry.characterId).map((f) => f.id);
      expect(secret.cards.map((card) => card.factId).sort()).toEqual([...ownFactIds].sort());
    }
  });

  it("証言カードの英文が配役されたプレイヤーのレベルのものになる", () => {
    const { secrets, publicState, players, gameSecret } = start(SIX);
    const target = CASES.find((entry) => entry.id === CASE_ID)!;
    for (const entry of publicState.cast) {
      const level = players.find((player) => player.id === entry.playerId)!.level;
      for (const card of secrets.get(entry.playerId)!.cards) {
        if (card.isLie) {
          continue;
        }
        const fact = target.facts.find((f) => f.id === card.factId)!;
        expect(card.textEn).toBe(fact.text[`${level}`]);
      }
    }
    expect(gameSecret.votes).toEqual([]);
  });

  it("捜査時間は設定を反映し、未指定なら既定値になる", () => {
    expect(start(SIX).publicState.investigationSeconds).toBe(600);
    expect(start(SIX, SEED, { investigationSeconds: 900 }).publicState.investigationSeconds).toBe(900);
  });
});

describe("start: おまかせ（ランダム）", () => {
  function startRandom(seed: number): { caseId: string; publicState: DetectivesPublic } {
    const players = makePlayers(SIX);
    const result = detectivesModule.start({ players, contentId: RANDOM_CASE_ID, settings: undefined, seed });
    return {
      caseId: (result.gameSecret as DetectivesGameSecret).caseId,
      publicState: result.publicState,
    };
  }

  it("収録されている事件のどれかが選ばれ、擬似idは残らない", () => {
    const ids = CASES.map((entry) => entry.id);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { caseId, publicState } = startRandom(seed);
      expect(ids).toContain(caseId);
      expect(publicState.caseId).toBe(caseId);
      expect(publicState.caseId).not.toBe(RANDOM_CASE_ID);
    }
  });

  it("同じseedからは同じ事件が選ばれる", () => {
    expect(startRandom(42).caseId).toBe(startRandom(42).caseId);
  });

  it("収録が2件以上あれば、seedによって違う事件が選ばれる", () => {
    if (CASES.length < 2) {
      return;
    }
    const picked = new Set(Array.from({ length: 40 }, (_, index) => startRandom(index + 1).caseId));
    expect(picked.size).toBeGreaterThan(1);
  });
});

describe("handleAction: ready", () => {
  // 受入条件8
  it("二重readyは拒否されず、状態も変わらない", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const room = makeRoom(players, STAGES.briefing);

    const first = detectivesModule.handleAction({
      room,
      publicState,
      gameSecret,
      playerId: "p1",
      action: "ready",
      payload: {},
    });
    expect(first.reject).toBeUndefined();
    const afterFirst = first.publicState as DetectivesPublic;
    expect(afterFirst.readyPlayerIds).toEqual(["p1"]);

    const second = detectivesModule.handleAction({
      room,
      publicState: afterFirst,
      gameSecret,
      playerId: "p1",
      action: "ready",
      payload: {},
    });
    expect(second.reject).toBeUndefined();
    expect((second.publicState as DetectivesPublic).readyPlayerIds).toEqual(["p1"]);
    expect(second.stage).toBeUndefined();
  });

  // 受入条件9
  it("接続中の全員が揃った時点で遷移し、切断者を待たない", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const withDisconnected = players.map((player) => (player.id === "p6" ? { ...player, connected: false } : player));
    const room = makeRoom(withDisconnected, STAGES.briefing);

    let state = publicState;
    let transition = undefined as ReturnType<typeof detectivesModule.handleAction> | undefined;
    for (const playerId of ["p1", "p2", "p3", "p4", "p5"]) {
      transition = detectivesModule.handleAction({
        room,
        publicState: state,
        gameSecret,
        playerId,
        action: "ready",
        payload: {},
      });
      state = transition.publicState as DetectivesPublic;
    }

    expect(transition?.stage).toBe(STAGES.investigation);
    expect(transition?.deadlineSeconds).toBe(600);
    expect(state.readyPlayerIds).not.toContain("p6");
  });

  it("briefing以外のready、参加者以外のreadyはinvalid_stageで拒否される", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const voting = detectivesModule.handleAction({
      room: makeRoom(players, STAGES.voting),
      publicState,
      gameSecret,
      playerId: "p1",
      action: "ready",
      payload: {},
    });
    expect(voting.reject).toEqual({ code: "invalid_stage" });

    const outsider = detectivesModule.handleAction({
      room: makeRoom(players, STAGES.briefing),
      publicState,
      gameSecret,
      playerId: "ghost",
      action: "ready",
      payload: {},
    });
    expect(outsider.reject).toEqual({ code: "invalid_stage" });
  });
});

describe("handleAction: endInvestigation", () => {
  it("ホストは捜査を切り上げて投票へ進める", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const transition = detectivesModule.handleAction({
      room: makeRoom(players, STAGES.investigation),
      publicState,
      gameSecret,
      playerId: "p1",
      action: "endInvestigation",
      payload: {},
    });
    expect(transition.reject).toBeUndefined();
    expect(transition.stage).toBe(STAGES.voting);
    expect(transition.deadlineSeconds).toBe(90);
  });

  it("ホスト以外はnot_hostで拒否される", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const transition = detectivesModule.handleAction({
      room: makeRoom(players, STAGES.investigation),
      publicState,
      gameSecret,
      playerId: "p2",
      action: "endInvestigation",
      payload: {},
    });
    expect(transition.reject).toEqual({ code: "not_host" });
    expect(transition.stage).toBeUndefined();
  });

  it("investigation以外ではinvalid_stageで拒否される", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const transition = detectivesModule.handleAction({
      room: makeRoom(players, STAGES.briefing),
      publicState,
      gameSecret,
      playerId: "p1",
      action: "endInvestigation",
      payload: {},
    });
    expect(transition.reject).toEqual({ code: "invalid_stage" });
  });
});

describe("handleAction: vote", () => {
  function votingState(): { room: Room; publicState: DetectivesPublic; gameSecret: DetectivesGameSecret } {
    const { players, publicState, gameSecret } = start(SIX);
    return { room: makeRoom(players, STAGES.voting), publicState, gameSecret };
  }

  // 受入条件6
  it("自分への投票はinvalid_targetで拒否され、状態が変わらない", () => {
    const { room, publicState, gameSecret } = votingState();
    const transition = detectivesModule.handleAction({
      room,
      publicState,
      gameSecret,
      playerId: "p1",
      action: "vote",
      payload: { targetPlayerId: "p1" },
    });
    expect(transition.reject).toEqual({ code: "invalid_target" });
    expect(transition.publicState).toBeUndefined();
    expect(transition.gameSecret).toBeUndefined();
  });

  it("参加者以外への投票もinvalid_targetで拒否される", () => {
    const { room, publicState, gameSecret } = votingState();
    for (const payload of [{ targetPlayerId: "ghost" }, {}, { targetPlayerId: 1 }]) {
      const transition = detectivesModule.handleAction({
        room,
        publicState,
        gameSecret,
        playerId: "p1",
        action: "vote",
        payload,
      });
      expect(transition.reject).toEqual({ code: "invalid_target" });
    }
  });

  // 受入条件7
  it("2回目の投票はalready_votedで拒否され、1回目が保持される", () => {
    const { room, publicState, gameSecret } = votingState();
    const first = detectivesModule.handleAction({
      room,
      publicState,
      gameSecret,
      playerId: "p1",
      action: "vote",
      payload: { targetPlayerId: "p2" },
    });
    const afterFirst = first.gameSecret as DetectivesGameSecret;
    expect(afterFirst.votes).toEqual([{ voterPlayerId: "p1", targetPlayerId: "p2" }]);

    const second = detectivesModule.handleAction({
      room,
      publicState: first.publicState as DetectivesPublic,
      gameSecret: afterFirst,
      playerId: "p1",
      action: "vote",
      payload: { targetPlayerId: "p3" },
    });
    expect(second.reject).toEqual({ code: "already_voted" });
    expect(afterFirst.votes).toEqual([{ voterPlayerId: "p1", targetPlayerId: "p2" }]);
  });

  it("接続中の全員が投票するとrevealへ遷移し、resultが返る", () => {
    const { room, publicState, gameSecret } = votingState();
    let state = publicState;
    let secret = gameSecret;
    let transition = undefined as ReturnType<typeof detectivesModule.handleAction> | undefined;

    for (const playerId of ["p1", "p2", "p3", "p4", "p5", "p6"]) {
      const targetPlayerId = playerId === "p1" ? "p2" : "p1";
      transition = detectivesModule.handleAction({
        room,
        publicState: state,
        gameSecret: secret,
        playerId,
        action: "vote",
        payload: { targetPlayerId },
      });
      state = transition.publicState as DetectivesPublic;
      secret = transition.gameSecret as DetectivesGameSecret;
    }

    expect(transition?.stage).toBe(STAGES.reveal);
    expect(transition?.result).toBeDefined();
    expect((transition?.result as DetectivesResult).votes).toHaveLength(6);
  });
});

describe("onDeadline", () => {
  it("briefingの締切で未readyを既読扱いにしてinvestigationへ進む", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const transition = detectivesModule.onDeadline({
      room: makeRoom(players, STAGES.briefing),
      publicState,
      gameSecret,
    });
    expect(transition.stage).toBe(STAGES.investigation);
    expect((transition.publicState as DetectivesPublic).readyPlayerIds).toHaveLength(6);
  });

  it("investigationの締切でvotingへ進む", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const transition = detectivesModule.onDeadline({
      room: makeRoom(players, STAGES.investigation),
      publicState,
      gameSecret,
    });
    expect(transition.stage).toBe(STAGES.voting);
    expect(transition.deadlineSeconds).toBe(90);
  });

  // 受入条件10
  it("votingの締切で未投票者が集計の分母にも分子にも入らない", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const culpritPlayerId = gameSecret.culpritPlayerId;
    const voter = players.find((player) => player.id !== culpritPlayerId)!.id;
    const withOneVote: DetectivesGameSecret = {
      ...gameSecret,
      votes: [{ voterPlayerId: voter, targetPlayerId: culpritPlayerId }],
    };

    const transition = detectivesModule.onDeadline({
      room: makeRoom(players, STAGES.voting),
      publicState,
      gameSecret: withOneVote,
    });
    const result = transition.result as DetectivesResult;

    // 1票だけが集計され、棄権5人は分母にも分子にも入らない
    expect(result.votes).toHaveLength(1);
    expect(result.outcome).toBe("citizens");
  });

  it("revealでは何も起きない", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const transition = detectivesModule.onDeadline({
      room: makeRoom(players, STAGES.reveal),
      publicState,
      gameSecret,
    });
    expect(transition).toEqual({});
  });
});

describe("result", () => {
  function revealWith(votes: DetectivesGameSecret["votes"]): DetectivesResult {
    const { players, publicState, gameSecret } = start(SIX);
    const transition = detectivesModule.onDeadline({
      room: makeRoom(players, STAGES.voting),
      publicState,
      gameSecret: { ...gameSecret, votes },
    });
    return transition.result as DetectivesResult;
  }

  function culpritOf(): { culpritPlayerId: string; others: string[]; players: Player[]; publicState: DetectivesPublic } {
    const { players, publicState, gameSecret } = start(SIX);
    return {
      culpritPlayerId: gameSecret.culpritPlayerId,
      others: players.map((player) => player.id).filter((id) => id !== gameSecret.culpritPlayerId),
      players,
      publicState,
    };
  }

  it("最多票が犯人なら市民勝利になる", () => {
    const { culpritPlayerId, others } = culpritOf();
    const result = revealWith([
      { voterPlayerId: others[0]!, targetPlayerId: culpritPlayerId },
      { voterPlayerId: others[1]!, targetPlayerId: culpritPlayerId },
      { voterPlayerId: others[2]!, targetPlayerId: others[3]! },
    ]);
    expect(result.outcome).toBe("citizens");
  });

  // 受入条件11
  it("最多票が並んだ場合はoutcomeがculpritになる", () => {
    const { culpritPlayerId, others } = culpritOf();
    const result = revealWith([
      { voterPlayerId: others[0]!, targetPlayerId: culpritPlayerId },
      { voterPlayerId: others[1]!, targetPlayerId: others[2]! },
    ]);
    expect(result.outcome).toBe("culprit");
  });

  it("1票も入らなければ犯人勝利になる", () => {
    expect(revealWith([]).outcome).toBe("culprit");
  });

  // 受入条件12
  it("lieCard.textEnが犯人役プレイヤーのレベルの英文と一致する", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const transition = detectivesModule.onDeadline({
      room: makeRoom(players, STAGES.voting),
      publicState,
      gameSecret,
    });
    const result = transition.result as DetectivesResult;

    const target = CASES.find((entry) => entry.id === CASE_ID)!;
    const variant = target.variants.find((entry) => entry.culprit === gameSecret.culpritCharacterId)!;
    const culpritLevel = players.find((player) => player.id === gameSecret.culpritPlayerId)!.level;

    expect(result.lieCard.textEn).toBe(variant.lie.text[`${culpritLevel}`]);
    expect(result.lieCard.hintJa).toBe(variant.lie.hintJa);
  });

  it("supportingCardsが所有キャラクターに配役されたプレイヤーのレベルの英文になる", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const result = detectivesModule.onDeadline({
      room: makeRoom(players, STAGES.voting),
      publicState,
      gameSecret,
    }).result as DetectivesResult;

    const target = CASES.find((entry) => entry.id === CASE_ID)!;
    const levelOfCharacter = new Map(
      publicState.cast.map((entry) => [
        entry.characterName,
        players.find((player) => player.id === entry.playerId)!.level,
      ]),
    );

    expect(result.contradictions.length).toBeGreaterThan(0);
    for (const contradiction of result.contradictions) {
      expect(contradiction.supportingCards.length).toBeGreaterThanOrEqual(2);
      for (const card of contradiction.supportingCards) {
        const level = levelOfCharacter.get(card.characterName)!;
        const fact = target.facts.find((f) => f.text[`${level}`] === card.textEn);
        expect(fact).toBeDefined();
      }
    }
  });

  it("嘘factはsupportingCardsに含めない（lieCardとして別に出す）", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const result = detectivesModule.onDeadline({
      room: makeRoom(players, STAGES.voting),
      publicState,
      gameSecret,
    }).result as DetectivesResult;

    for (const contradiction of result.contradictions) {
      for (const card of contradiction.supportingCards) {
        expect(card.textEn).not.toBe(result.lieCard.textEn);
      }
    }
  });

  it("真相タイムラインと重要表現をそのまま返す", () => {
    const { players, publicState, gameSecret } = start(SIX);
    const result = detectivesModule.onDeadline({
      room: makeRoom(players, STAGES.voting),
      publicState,
      gameSecret,
    }).result as DetectivesResult;
    const target = CASES.find((entry) => entry.id === CASE_ID)!;
    expect(result.timelineEn).toEqual(target.reveal.timelineEn);
    expect(result.keyExpressions).toEqual(target.reveal.keyExpressions);
  });
});

describe("listContents / validateSettings", () => {
  it("公開メタ情報だけを返す（facts・variants・revealを含めない）", () => {
    const contents = detectivesModule.listContents();
    expect(contents.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(contents);
    expect(serialized).not.toContain("facts");
    expect(serialized).not.toContain("variants");
    expect(serialized).not.toContain("reveal");
    expect(contents.some((content) => content.id === CASE_ID)).toBe(true);
  });

  it("先頭に「おまかせ」を置く（ロビーの既定選択にするため）", () => {
    const contents = detectivesModule.listContents();
    expect(contents[0]?.id).toBe(RANDOM_CASE_ID);
    expect(contents.filter((content) => content.id === RANDOM_CASE_ID)).toHaveLength(1);
  });

  // 受入条件13
  it("範囲外の捜査時間を拒否する", () => {
    expect(detectivesModule.validateSettings({ investigationSeconds: 600 }).valid).toBe(true);
    expect(detectivesModule.validateSettings({ investigationSeconds: 299 }).valid).toBe(false);
    expect(detectivesModule.validateSettings({ investigationSeconds: 1201 }).valid).toBe(false);
    expect(detectivesModule.validateSettings({ investigationSeconds: 600.5 }).valid).toBe(false);
    expect(detectivesModule.validateSettings({ investigationSeconds: "600" }).valid).toBe(false);
  });

  it("settings未指定と空オブジェクトを受理する", () => {
    expect(detectivesModule.validateSettings(undefined).valid).toBe(true);
    expect(detectivesModule.validateSettings({}).valid).toBe(true);
  });
});
