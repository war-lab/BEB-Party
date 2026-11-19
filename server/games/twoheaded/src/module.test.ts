// TWO-HEADED SPEAKERのGameModuleのテスト（基本設計/16のテスト観点）。
//
// GameModule は純粋関数のため、Durable Objectなしで全項目を確かめる。
// 山札が尽きる経路には小さいセットが要るため、お題セットの引き先をフィクスチャへ差し替える。
import { describe, expect, it, vi } from "vitest";
import type { Level } from "@beb/shared-core";
import {
  ACTIONS,
  ERROR_CODES,
  MAX_CARDS_PER_TURN,
  MIN_CARDS,
  STAGES,
  TURN_SECONDS,
  placesOf,
  type ExplainerSecret,
  type TwoHeadedSet,
} from "@beb/shared-twoheaded";
import {
  act,
  apply,
  claim,
  expire,
  explainersOf,
  otherTeamIdOf,
  pass,
  readyAll,
  roomOf,
  setConnected,
  startLive,
  startTurn,
  type Live,
} from "./test-support/harness";

const LARGE_SET_ID = "fixture_set_v1";
const SMALL_SET_ID = "fixture_small_v1";

vi.mock("./sets", async () => {
  const { validSet } = await import("./test-support/fixtures");
  const { MIN_CARDS: minCards } = await import("@beb/shared-twoheaded");
  const large = validSet(minCards);
  // 7枚しかない山札。8人2周の途中で尽きる
  const small: TwoHeadedSet = { ...validSet(7), id: SMALL_SET_ID };
  const sets = [large, small];
  return {
    SETS: sets,
    findSet: (setId: string) => sets.find((entry) => entry.id === setId),
    summarize: (target: TwoHeadedSet) => ({ id: target.id, title: target.title, cardCount: target.cards.length }),
  };
});

const { twoHeadedModule } = await import("./module");
const { playersOf, validSet } = await import("./test-support/fixtures");

const LEVELS: Record<number, Level[]> = {
  6: [1, 2, 3, 3, 4, 5],
  7: [1, 1, 2, 3, 4, 5, 5],
  8: [1, 1, 2, 3, 3, 4, 5, 5],
};

function begin(
  count: number,
  options: { settings?: unknown; seed?: number; contentId?: string; pinnedPairs?: [string, string][] } = {},
): Live {
  return startLive(twoHeadedModule, playersOf(count, LEVELS[count]), {
    contentId: options.contentId ?? LARGE_SET_ID,
    settings: options.settings,
    seed: options.seed,
    pinnedPairs: options.pinnedPairs,
  });
}

/** briefing を抜けて最初の手番の handoff まで進める */
function toFirstHandoff(count: number, options: { settings?: unknown; seed?: number; contentId?: string } = {}): Live {
  return readyAll(twoHeadedModule, begin(count, options));
}

const fixture = validSet(MIN_CARDS);
function cardOf(cardId: string | null) {
  return fixture.cards.find((card) => card.id === cardId);
}

// --- 記述子と設定 ---

describe("記述子", () => {
  it("ロビーの記述子が16と一致する", () => {
    expect(twoHeadedModule.title).toBe("TWO-HEADED SPEAKER");
    expect(twoHeadedModule.tagline).toBe("ペアで1語ずつ交互に話し、お題を英語で説明する");
    expect(twoHeadedModule.icon).toBe("\u{1F465}");
    expect(twoHeadedModule.playerCount).toEqual([6, 8]);
    expect(twoHeadedModule.contentLabelJa).toBe("お題セットを選ぶ");
  });

  it("周回数の選択肢と既定（2周）が記述子に出る", () => {
    const field = twoHeadedModule.settingsFields.find((entry) => entry.key === "laps");
    if (field?.type !== "select") {
      throw new Error("lapsの記述子がselectでない");
    }
    expect(field.options.map((option) => option.value)).toEqual(["1", "2"]);
    expect(field.default).toBe("2");
  });

  it("記述子の min / max と validateSettings の受理範囲が一致する", () => {
    const field = twoHeadedModule.settingsFields.find((entry) => entry.key === "turnSeconds");
    if (field?.type !== "number") {
      throw new Error("turnSecondsの記述子がnumberでない");
    }
    expect([field.min, field.max, field.default, field.step]).toEqual([60, 120, 90, 15]);
    expect(twoHeadedModule.validateSettings({ turnSeconds: field.min }).valid).toBe(true);
    expect(twoHeadedModule.validateSettings({ turnSeconds: field.max }).valid).toBe(true);
    expect(twoHeadedModule.validateSettings({ turnSeconds: field.min - 1 }).valid).toBe(false);
    expect(twoHeadedModule.validateSettings({ turnSeconds: field.max + 1 }).valid).toBe(false);
  });
});

describe("validateSettings", () => {
  it("settingsが無い場合とキーが欠けている場合は受理し、既定値で開始する", () => {
    expect(twoHeadedModule.validateSettings(undefined).valid).toBe(true);
    expect(twoHeadedModule.validateSettings(null).valid).toBe(true);
    expect(twoHeadedModule.validateSettings({}).valid).toBe(true);
    const live = begin(6, { settings: {} });
    expect(live.publicState.turnSeconds).toBe(TURN_SECONDS.default);
    expect(live.publicState.laps).toBe(2);
  });

  it("型違いと範囲外を拒否する", () => {
    expect(twoHeadedModule.validateSettings("90").valid).toBe(false);
    expect(twoHeadedModule.validateSettings({ turnSeconds: "90" }).valid).toBe(false);
    expect(twoHeadedModule.validateSettings({ turnSeconds: 90.5 }).valid).toBe(false);
    expect(twoHeadedModule.validateSettings({ laps: "3" }).valid).toBe(false);
    expect(twoHeadedModule.validateSettings({ laps: 2 }).valid).toBe(false);
    expect(twoHeadedModule.validateSettings({ laps: "1", turnSeconds: 75 }).valid).toBe(true);
  });

  it("設定した値を公開状態へ写す", () => {
    const live = begin(6, { settings: { laps: "1", turnSeconds: 105 } });
    expect(live.publicState.turnSeconds).toBe(105);
    expect(live.publicState.laps).toBe(1);
    expect(live.publicState.turnOrder).toHaveLength(3);
  });
});

describe("listContents", () => {
  it("公開メタだけを返し、お題を含めない（秘密の非混入）", () => {
    const contents = twoHeadedModule.listContents();
    expect(contents).toEqual([
      { id: LARGE_SET_ID, title: "テスト用のお題", cardCount: MIN_CARDS },
      { id: SMALL_SET_ID, title: "テスト用のお題", cardCount: 7 },
    ]);
    const json = JSON.stringify(contents);
    expect(json).not.toContain("thing");
    expect(json).not.toContain("もの");
  });
});

// --- start ---

describe("start", () => {
  it("決定性: 同じseedと同じ参加者から、同じペア・turnOrder・山札の順序が得られる", () => {
    const a = begin(8, { seed: 99 });
    const b = begin(8, { seed: 99 });
    expect(a.publicState.teams).toEqual(b.publicState.teams);
    expect(a.publicState.turnOrder).toEqual(b.publicState.turnOrder);
    expect(a.gameSecret.deck).toEqual(b.gameSecret.deck);
    const c = begin(8, { seed: 100 });
    expect(c.gameSecret.deck).not.toEqual(a.gameSecret.deck);
  });

  it.each([
    [6, [2, 2, 2]],
    [7, [2, 2, 3]],
    [8, [2, 2, 2, 2]],
  ])("編成: %i人で %j のペアができ、全員がちょうど1組に入る", (count, sizes) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const live = begin(count, { seed });
      const teams = live.publicState.teams;
      expect(teams.map((team) => team.members.length).sort()).toEqual([...sizes].sort());
      expect(teams.map((team) => team.teamId)).toEqual(sizes.map((_, index) => `t${index + 1}`));
      const members = teams.flatMap((team) => team.members);
      expect(new Set(members).size).toBe(count);
      expect(members.sort()).toEqual(live.players.map((player) => player.id).sort());
    }
  });

  // ペアの指定（ADR-0035）。指定が効かないこと、指定が無いときの編成が変わることの両方を検出する
  it("ペアの指定: acceptsPinnedPairs を宣言する", () => {
    expect(twoHeadedModule.acceptsPinnedPairs).toBe(true);
  });

  it.each([6, 7, 8])("ペアの指定: %i人で、指定した組がどのseedでも同じペアに入る", (count) => {
    const pinnedPairs: [string, string][] =
      count === 8
        ? [
            ["p1", "p8"],
            ["p2", "p7"],
            ["p3", "p6"],
            ["p4", "p5"],
          ]
        : [
            ["p1", "p2"],
            ["p3", `p${count}`],
          ];
    for (let seed = 1; seed <= 20; seed += 1) {
      const live = begin(count, { seed, pinnedPairs });
      for (const [a, b] of pinnedPairs) {
        const team = live.publicState.teams.find((entry) => entry.members.includes(a));
        expect(team?.members).toContain(b);
      }
    }
  });

  it("ペアの指定: 指定が空なら、同じseedで指定を渡さない場合と同じ編成になる", () => {
    for (const seed of [1, 2, 3]) {
      expect(begin(8, { seed, pinnedPairs: [] }).publicState.teams).toEqual(begin(8, { seed }).publicState.teams);
    }
  });

  it("編成: 入室順の先頭の人が、多数のseedでペアの中の先頭に偏らない", () => {
    let first = 0;
    const seeds = 400;
    for (let seed = 1; seed <= seeds; seed += 1) {
      const live = begin(6, { seed });
      const team = live.publicState.teams.find((entry) => entry.members.includes("p1"));
      if (team?.members[0] === "p1") {
        first += 1;
      }
    }
    // 2人のペアで偏りがなければ半分前後になる。並びを入れ替えないと常に先頭になる
    expect(first / seeds).toBeGreaterThan(0.35);
    expect(first / seeds).toBeLessThan(0.65);
  });

  it("手番の巡回: 全ペアが周回数と同じ回数ずつ説明役を務める", () => {
    for (const laps of ["1", "2"] as const) {
      for (const count of [6, 7, 8]) {
        const live = begin(count, { settings: { laps } });
        const { teams, turnOrder } = live.publicState;
        expect(turnOrder).toHaveLength(teams.length * Number(laps));
        for (const team of teams) {
          expect(turnOrder.filter((teamId) => teamId === team.teamId)).toHaveLength(Number(laps));
        }
        // 2周目も1周目と同じ順で回す
        expect(turnOrder.slice(0, teams.length)).toEqual(teams.map((team) => team.teamId));
      }
    }
  });

  it("秘密の配布: startで全員に当てる側の値が届き、お題は届かない", () => {
    const live = begin(6);
    expect(live.stage).toBe(STAGES.briefing);
    expect(live.deadlineSeconds).toBe(90);
    expect([...live.sent.values()]).toEqual(Array.from({ length: 6 }, () => ({ role: "guesser" })));
    expect(live.gameSecret.currentCardId).toBeNull();
    expect(live.publicState.speakingOrder).toEqual([]);
  });
});

// --- 進行 ---

describe("briefing", () => {
  it("接続中の全員がreadyを送ると最初のhandoffへ進み、1枚目が説明役のペアにだけ届く", () => {
    let live = begin(6);
    for (const player of live.players.slice(0, 5)) {
      live = act(twoHeadedModule, live, player.id, ACTIONS.ready);
      expect(live.stage).toBe(STAGES.briefing);
    }
    // 二重送信は冪等に扱う
    live = act(twoHeadedModule, live, "p1", ACTIONS.ready);
    expect(live.lastReject).toBeUndefined();
    expect(live.publicState.readyPlayerIds).toHaveLength(5);
    live = act(twoHeadedModule, live, "p6", ACTIONS.ready);
    expect(live.stage).toBe(STAGES.handoff);
    expect(live.deadlineSeconds).toBe(30);

    const explainers = explainersOf(live);
    const card = cardOf(live.gameSecret.currentCardId);
    for (const player of live.players) {
      const secret = live.sent.get(player.id);
      if (explainers.includes(player.id)) {
        expect(secret).toEqual({
          role: "explainer",
          card: { cardId: card?.id, answer: card?.answer, ja: card?.ja, aliases: card?.aliases ?? [] },
        });
      } else {
        expect(secret).toEqual({ role: "guesser" });
      }
    }
  });

  it("締切で未readyを既読扱いにして最初のhandoffへ進む", () => {
    const live = expire(twoHeadedModule, begin(6));
    expect(live.stage).toBe(STAGES.handoff);
    expect(live.publicState.readyPlayerIds).toHaveLength(6);
  });

  it("切断中の人を待たずに進む", () => {
    let live = setConnected(begin(6), ["p6"], false);
    for (const player of live.players.slice(0, 5)) {
      live = act(twoHeadedModule, live, player.id, ACTIONS.ready);
    }
    expect(live.stage).toBe(STAGES.handoff);
  });
});

describe("startTurn", () => {
  it("説明役のペア以外は not_explainer で拒否される", () => {
    const live = toFirstHandoff(6);
    const outsider = live.players.find((player) => !explainersOf(live).includes(player.id))?.id ?? "";
    expect(act(twoHeadedModule, live, outsider, ACTIONS.startTurn).lastReject).toBe(ERROR_CODES.notExplainer);
  });

  it("ペアのどちらが送ってもよく、後から届いた1件は invalid_stage になる", () => {
    let live = toFirstHandoff(6);
    const [first, second] = explainersOf(live);
    live = act(twoHeadedModule, live, second ?? "", ACTIONS.startTurn);
    expect(live.stage).toBe(STAGES.explaining);
    expect(live.deadlineSeconds).toBe(TURN_SECONDS.default);
    expect(act(twoHeadedModule, live, first ?? "", ACTIONS.startTurn).lastReject).toBe(ERROR_CODES.invalidStage);
  });

  it("参加者でない送信者と未知のactionは invalid_stage で拒否される", () => {
    const live = toFirstHandoff(6);
    expect(act(twoHeadedModule, live, "stranger", ACTIONS.startTurn).lastReject).toBe(ERROR_CODES.invalidStage);
    expect(act(twoHeadedModule, live, "p1", "dance").lastReject).toBe(ERROR_CODES.invalidStage);
  });
});

describe("claimCorrect", () => {
  it("説明役のペアと当てたペアに1点ずつ入り、終えたお題が lastCard に載る", () => {
    let live = startTurn(twoHeadedModule, toFirstHandoff(6));
    const explainerTeamId = live.publicState.turnOrder[0] ?? "";
    const guessed = otherTeamIdOf(live);
    const card = cardOf(live.gameSecret.currentCardId);
    live = claim(twoHeadedModule, live, guessed);
    expect(live.lastReject).toBeUndefined();
    const points = Object.fromEntries(live.publicState.scores.map((score) => [score.teamId, score.points]));
    expect(points[explainerTeamId]).toBe(1);
    expect(points[guessed]).toBe(1);
    expect(Object.values(points).reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(live.publicState.solvedThisTurn).toBe(1);
    expect(live.publicState.lastCard).toEqual({ answer: card?.answer, ja: card?.ja, outcome: "solved", guessedTeamId: guessed });
    // 次のお題は説明役のペアにだけ送る
    expect([...(live.lastSecrets?.keys() ?? [])].sort()).toEqual([...explainersOf(live)].sort());
  });

  it("自分のペアと存在しないペアは invalid_target、古い cardId は stale_card で拒否され、得点が動かない", () => {
    const live = startTurn(twoHeadedModule, toFirstHandoff(6));
    const explainerTeamId = live.publicState.turnOrder[0] ?? "";
    const before = live.publicState.scores;
    const own = claim(twoHeadedModule, live, explainerTeamId);
    expect(own.lastReject).toBe(ERROR_CODES.invalidTarget);
    const missing = claim(twoHeadedModule, live, "t9");
    expect(missing.lastReject).toBe(ERROR_CODES.invalidTarget);
    const notString = act(twoHeadedModule, live, explainersOf(live)[0] ?? "", ACTIONS.claimCorrect, {
      cardId: live.gameSecret.currentCardId,
    });
    expect(notString.lastReject).toBe(ERROR_CODES.invalidTarget);
    const stale = act(twoHeadedModule, live, explainersOf(live)[0] ?? "", ACTIONS.claimCorrect, {
      cardId: "card_999",
      teamId: otherTeamIdOf(live),
    });
    expect(stale.lastReject).toBe(ERROR_CODES.staleCard);
    for (const rejected of [own, missing, notString, stale]) {
      expect(rejected.publicState.scores).toEqual(before);
    }
  });

  it("拒否の判定は表の左から順に行う（当てる側の申告は not_explainer、handoff中は invalid_stage）", () => {
    const handoff = toFirstHandoff(6);
    const explainer = explainersOf(handoff)[0] ?? "";
    expect(claim(twoHeadedModule, handoff, "t9", explainer).lastReject).toBe(ERROR_CODES.invalidStage);
    const live = startTurn(twoHeadedModule, handoff);
    const outsider = live.players.find((player) => !explainersOf(live).includes(player.id))?.id ?? "";
    expect(
      act(twoHeadedModule, live, outsider, ACTIONS.claimCorrect, { cardId: "card_999", teamId: "t9" }).lastReject,
    ).toBe(ERROR_CODES.notExplainer);
    // invalid_target と stale_card の両方に当たる場合は invalid_target
    expect(act(twoHeadedModule, live, explainer, ACTIONS.claimCorrect, { cardId: "card_999", teamId: "t9" }).lastReject).toBe(
      ERROR_CODES.invalidTarget,
    );
  });

  it("説明役のペアの2人がほぼ同時に申告しても、加点は1回だけである", () => {
    const live = startTurn(twoHeadedModule, toFirstHandoff(6));
    const [first, second] = explainersOf(live);
    const payload = { cardId: live.gameSecret.currentCardId, teamId: otherTeamIdOf(live) };
    const once = act(twoHeadedModule, live, first ?? "", ACTIONS.claimCorrect, payload);
    const twice = act(twoHeadedModule, once, second ?? "", ACTIONS.claimCorrect, payload);
    expect(twice.lastReject).toBe(ERROR_CODES.staleCard);
    const total = twice.publicState.scores.reduce((sum, score) => sum + score.points, 0);
    expect(total).toBe(2);
  });
});

describe("passCard", () => {
  it("得点が動かず、送ったお題が lastCard に載り、消費上限に数えられる", () => {
    let live = startTurn(twoHeadedModule, toFirstHandoff(6));
    const card = cardOf(live.gameSecret.currentCardId);
    live = pass(twoHeadedModule, live);
    expect(live.publicState.scores.every((score) => score.points === 0)).toBe(true);
    expect(live.publicState.passedThisTurn).toBe(1);
    expect(live.publicState.lastCard).toEqual({ answer: card?.answer, ja: card?.ja, outcome: "passed", guessedTeamId: null });
  });

  it("当てる側は not_explainer、古い cardId は stale_card で拒否される", () => {
    const live = startTurn(twoHeadedModule, toFirstHandoff(6));
    const outsider = live.players.find((player) => !explainersOf(live).includes(player.id))?.id ?? "";
    expect(pass(twoHeadedModule, live, outsider).lastReject).toBe(ERROR_CODES.notExplainer);
    expect(
      act(twoHeadedModule, live, explainersOf(live)[0] ?? "", ACTIONS.passCard, { cardId: "card_999" }).lastReject,
    ).toBe(ERROR_CODES.staleCard);
    expect(act(twoHeadedModule, live, explainersOf(live)[0] ?? "", ACTIONS.passCard, {}).lastReject).toBe(
      ERROR_CODES.staleCard,
    );
  });

  it("送りの回数は手番ごとに制限しない", () => {
    let live = startTurn(twoHeadedModule, toFirstHandoff(6));
    for (let index = 0; index < MAX_CARDS_PER_TURN - 1; index += 1) {
      live = pass(twoHeadedModule, live);
      expect(live.lastReject).toBeUndefined();
    }
    expect(live.publicState.passedThisTurn).toBe(MAX_CARDS_PER_TURN - 1);
    expect(live.stage).toBe(STAGES.explaining);
  });
});

describe("消費上限", () => {
  it("正解と送りの合計が5回で手番が終わり、turns に集計が入る", () => {
    let live = startTurn(twoHeadedModule, toFirstHandoff(6));
    const teamId = live.publicState.turnOrder[0];
    live = claim(twoHeadedModule, live);
    live = pass(twoHeadedModule, live);
    live = claim(twoHeadedModule, live);
    live = pass(twoHeadedModule, live);
    expect(live.stage).toBe(STAGES.explaining);
    live = claim(twoHeadedModule, live);
    expect(live.stage).toBe(STAGES.handoff);
    expect(live.publicState.turnIndex).toBe(1);
    expect(live.publicState.turns).toEqual([{ teamId, solved: 3, passed: 2, skipped: false }]);
    expect(live.publicState.solvedThisTurn).toBe(0);
    expect(live.publicState.passedThisTurn).toBe(0);
    expect(live.publicState.lastCard).toBeNull();
  });
});

describe("話す順", () => {
  it("2人のペアでお題ごとに先に話す人が入れ替わり、手番をまたいでも数え直さない", () => {
    let live = startTurn(twoHeadedModule, toFirstHandoff(6, { seed: 7 }));
    const team = live.publicState.teams[0];
    const [a, b] = team?.members ?? [];
    expect(live.publicState.speakingOrder).toEqual([a, b]);
    live = claim(twoHeadedModule, live);
    expect(live.publicState.speakingOrder).toEqual([b, a]);
    live = pass(twoHeadedModule, live);
    expect(live.publicState.speakingOrder).toEqual([a, b]);
    // 3枚目を締切で終える。説明は済んでいるため通し番号に数える
    live = expire(twoHeadedModule, live);
    // 残りの2組の手番を終える
    for (let index = 0; index < 2; index += 1) {
      live = expire(twoHeadedModule, startTurn(twoHeadedModule, live));
    }
    // 2周目の最初の手番は同じペア。3枚を説明したため、4枚目は2人目から始まる
    expect(live.publicState.turnOrder[live.publicState.turnIndex]).toBe(team?.teamId);
    expect(live.publicState.speakingOrder).toEqual([b, a]);
  });

  it("3人組で3人が順に先頭になる", () => {
    let live = toFirstHandoff(7, { seed: 11 });
    const trio = live.publicState.teams.find((team) => team.members.length === 3);
    const [a, b, c] = trio?.members ?? [];
    // 3人組の手番まで進める
    while (live.publicState.turnOrder[live.publicState.turnIndex] !== trio?.teamId) {
      live = expire(twoHeadedModule, startTurn(twoHeadedModule, live));
    }
    live = startTurn(twoHeadedModule, live);
    expect(live.publicState.speakingOrder).toEqual([a, b, c]);
    live = pass(twoHeadedModule, live);
    expect(live.publicState.speakingOrder).toEqual([b, c, a]);
    live = claim(twoHeadedModule, live);
    expect(live.publicState.speakingOrder).toEqual([c, a, b]);
    live = pass(twoHeadedModule, live);
    expect(live.publicState.speakingOrder).toEqual([a, b, c]);
  });

  it("briefing と debrief では話す順を出さない", () => {
    expect(begin(6).publicState.speakingOrder).toEqual([]);
    const finished = playToEnd(begin(6, { settings: { laps: "1" } }));
    expect(finished.stage).toBe(STAGES.debrief);
    expect(finished.publicState.speakingOrder).toEqual([]);
  });
});

describe("締切", () => {
  it("explaining の締切で表示中のお題が timeout として記録され、3つのカウンタが戻る", () => {
    let live = startTurn(twoHeadedModule, toFirstHandoff(6));
    live = claim(twoHeadedModule, live);
    const timeoutCardId = live.gameSecret.currentCardId;
    live = expire(twoHeadedModule, live);
    expect(live.stage).toBe(STAGES.handoff);
    expect(live.gameSecret.usedCards.at(-1)).toEqual({
      cardId: timeoutCardId,
      teamId: live.publicState.turnOrder[0],
      outcome: "timeout",
      guessedTeamId: null,
    });
    expect(live.publicState.solvedThisTurn).toBe(0);
    expect(live.publicState.passedThisTurn).toBe(0);
    expect(live.publicState.lastCard).toBeNull();
    // 次の手番は新しいお題から始める
    expect(live.gameSecret.currentCardId).not.toBe(timeoutCardId);
  });

  it("handoff の締切で説明役のペアが2人そろっていれば explaining へ進む", () => {
    const live = expire(twoHeadedModule, toFirstHandoff(6));
    expect(live.stage).toBe(STAGES.explaining);
    expect(live.deadlineSeconds).toBe(TURN_SECONDS.default);
  });

  it("未接続: 説明役のペアの接続中が2人未満なら手番が飛ばされ、そのお題が usedCards に入らない", () => {
    let live = toFirstHandoff(6);
    const skippedCardId = live.gameSecret.currentCardId;
    const teamId = live.publicState.turnOrder[0];
    live = setConnected(live, [explainersOf(live)[1] ?? ""], false);
    live = expire(twoHeadedModule, live);
    expect(live.stage).toBe(STAGES.handoff);
    expect(live.publicState.turnIndex).toBe(1);
    expect(live.publicState.turns).toEqual([{ teamId, solved: 0, passed: 0, skipped: true }]);
    expect(live.gameSecret.usedCards).toEqual([]);
    expect(live.gameSecret.currentCardId).not.toBe(skippedCardId);
    // 飛ばした手番のお題は誰も説明していないため、通し番号に数えない
    expect(live.gameSecret.cardsExplained[teamId ?? ""]).toBe(0);
  });

  it("未接続: 3人組は2人が接続していれば進む", () => {
    let live = toFirstHandoff(7, { seed: 3 });
    const trio = live.publicState.teams.find((team) => team.members.length === 3);
    while (live.publicState.turnOrder[live.publicState.turnIndex] !== trio?.teamId) {
      live = expire(twoHeadedModule, startTurn(twoHeadedModule, live));
    }
    const twoLeft = expire(twoHeadedModule, setConnected(live, [trio?.members[0] ?? ""], false));
    expect(twoLeft.stage).toBe(STAGES.explaining);
    const oneLeft = expire(twoHeadedModule, setConnected(live, (trio?.members ?? []).slice(0, 2), false));
    expect(oneLeft.stage).toBe(STAGES.handoff);
    expect(oneLeft.publicState.turns.at(-1)?.skipped).toBe(true);
  });

  it("explaining の途中で説明役の1人が切断しても手番は続く", () => {
    let live = startTurn(twoHeadedModule, toFirstHandoff(6));
    live = setConnected(live, [explainersOf(live)[1] ?? ""], false);
    live = claim(twoHeadedModule, live);
    expect(live.stage).toBe(STAGES.explaining);
    expect(live.publicState.solvedThisTurn).toBe(1);
  });
});

describe("lastCard", () => {
  it("正解と送りで更新され、手番が変わると null に戻る", () => {
    let live = startTurn(twoHeadedModule, toFirstHandoff(6));
    expect(live.publicState.lastCard).toBeNull();
    live = claim(twoHeadedModule, live);
    expect(live.publicState.lastCard?.outcome).toBe("solved");
    live = pass(twoHeadedModule, live);
    expect(live.publicState.lastCard?.outcome).toBe("passed");
    live = expire(twoHeadedModule, live);
    expect(live.publicState.lastCard).toBeNull();
  });
});

// --- 通し ---

/**
 * 1手番を、説明役のペアの申告で消費上限まで進める。正解と送りを交互に混ぜる。
 * 当てたペアは説明役以外のペアを順に回す。
 */
function playTurnToLimit(live: Live): Live {
  let next = startTurn(twoHeadedModule, live);
  const turnIndex = next.publicState.turnIndex;
  for (let index = 0; index < MAX_CARDS_PER_TURN && next.stage === STAGES.explaining; index += 1) {
    if (index % 2 === 0) {
      const explainerTeamId = next.publicState.turnOrder[turnIndex];
      const others = next.publicState.teams.filter((team) => team.teamId !== explainerTeamId);
      next = claim(twoHeadedModule, next, others[(turnIndex + index) % others.length]?.teamId);
    } else {
      next = pass(twoHeadedModule, next);
    }
    expect(next.lastReject).toBeUndefined();
  }
  return next;
}

function playToEnd(live: Live): Live {
  let next = live.stage === STAGES.briefing ? readyAll(twoHeadedModule, live) : live;
  while (next.stage !== STAGES.debrief) {
    next = playTurnToLimit(next);
  }
  return next;
}

describe("山札", () => {
  it("8人で2周の8手番で毎手番上限まで消費しても、下限枚数の山札が尽きない", () => {
    const live = playToEnd(begin(8));
    expect(live.publicState.turns).toHaveLength(8);
    expect(live.publicState.turns.every((turn) => !turn.skipped && turn.solved + turn.passed === MAX_CARDS_PER_TURN)).toBe(
      true,
    );
    expect(live.gameSecret.usedCards).toHaveLength(MIN_CARDS);
  });

  it("山札が尽きたら、残りの手番があっても結果へ進む", () => {
    let live = toFirstHandoff(8, { contentId: SMALL_SET_ID });
    live = playTurnToLimit(live);
    expect(live.stage).toBe(STAGES.handoff);
    // 7枚の山札。2手番目の2枚目を終えたところで尽きる
    live = startTurn(twoHeadedModule, live);
    live = claim(twoHeadedModule, live);
    live = pass(twoHeadedModule, live);
    expect(live.stage).toBe(STAGES.debrief);
    expect(live.lifecycle).toBe("finished");
    expect(live.publicState.turns).toHaveLength(2);
    expect(live.result?.usedCards).toHaveLength(7);
  });
});

describe("人数", () => {
  it.each([6, 7, 8])("%i人で開始から debrief まで進む", (count) => {
    const live = playToEnd(begin(count));
    expect(live.stage).toBe(STAGES.debrief);
    expect(live.lifecycle).toBe("finished");
    expect(live.result?.teams).toEqual(live.publicState.teams);
  });
});

describe("結果", () => {
  it("得点の降順に並び、同点が同じ順位になる。飛ばした手番のお題を含めない", () => {
    let live = toFirstHandoff(6, { settings: { laps: "1" }, seed: 5 });
    const [t1, t2, t3] = live.publicState.teams.map((team) => team.teamId);
    // 1手番目（t1）: t2 が2回当てる
    live = startTurn(twoHeadedModule, live);
    live = claim(twoHeadedModule, live, t2);
    live = claim(twoHeadedModule, live, t2);
    const timeoutCardId = live.gameSecret.currentCardId;
    live = expire(twoHeadedModule, live);
    // 2手番目（t2）: 説明役の1人が切断して飛ばす
    const skippedCardId = live.gameSecret.currentCardId;
    live = expire(twoHeadedModule, setConnected(live, [explainersOf(live)[0] ?? ""], false));
    live = setConnected(live, live.players.map((player) => player.id), true);
    // 3手番目（t3）: t1 が1回当てる
    live = startTurn(twoHeadedModule, live);
    live = claim(twoHeadedModule, live, t1);
    live = expire(twoHeadedModule, live);

    expect(live.stage).toBe(STAGES.debrief);
    const result = live.result;
    // t1: 説明2 + 当て1 = 3、t2: 当て2 = 2、t3: 説明1 = 1
    expect(result?.scores).toEqual([
      { teamId: t1, points: 3 },
      { teamId: t2, points: 2 },
      { teamId: t3, points: 1 },
    ]);
    expect(result?.turns.map((turn) => turn.skipped)).toEqual([false, true, false]);
    const answers = result?.usedCards.map((card) => card.answer) ?? [];
    expect(answers).not.toContain(cardOf(skippedCardId)?.answer);
    expect(answers).toContain(cardOf(timeoutCardId)?.answer);
    expect(result?.usedCards.map((card) => card.outcome)).toEqual(["solved", "solved", "timeout", "solved", "timeout"]);
    expect(result?.usedCards[0]).toMatchObject({ teamId: t1, guessedTeamId: t2 });
    expect(result?.keyExpressions).toEqual(fixture.keyExpressions);
  });

  it("同点は同じ順位として扱える並びを返す", () => {
    let live = toFirstHandoff(6, { settings: { laps: "1" } });
    for (let index = 0; index < 3; index += 1) {
      live = expire(twoHeadedModule, startTurn(twoHeadedModule, live));
    }
    const scores = live.result?.scores ?? [];
    expect(scores.map((score) => score.points)).toEqual([0, 0, 0]);
    expect([...placesOf(scores).values()]).toEqual([1, 1, 1]);
  });
});

// --- 秘密の非混入 ---

const PUBLIC_KEYS = [
  "laps",
  "lastCard",
  "passedThisTurn",
  "readyPlayerIds",
  "scores",
  "setId",
  "solvedThisTurn",
  "speakingOrder",
  "starters",
  "teams",
  "turnIndex",
  "turnOrder",
  "turnSeconds",
  "turns",
];

function expectPublicAllowlist(live: Live): void {
  const state = live.publicState;
  expect(Object.keys(state).sort()).toEqual(PUBLIC_KEYS);
  for (const team of state.teams) {
    expect(Object.keys(team).sort()).toEqual(["members", "teamId"]);
  }
  for (const score of state.scores) {
    expect(Object.keys(score).sort()).toEqual(["points", "teamId"]);
  }
  for (const turn of state.turns) {
    expect(Object.keys(turn).sort()).toEqual(["passed", "skipped", "solved", "teamId"]);
  }
  for (const starter of state.starters) {
    expect(Object.keys(starter).sort()).toEqual(["en", "ja"]);
  }
  if (state.lastCard !== null) {
    expect(Object.keys(state.lastCard).sort()).toEqual(["answer", "guessedTeamId", "ja", "outcome"]);
  }
}

/** 終えていないお題（表示中と山札の残り）の answer / ja / aliases が公開状態に現れない */
function expectNoUnfinishedCard(live: Live): void {
  const json = JSON.stringify(live.publicState);
  const finished = new Set(
    live.gameSecret.usedCards.filter((used) => used.outcome !== "timeout").map((used) => used.cardId),
  );
  for (const card of fixture.cards) {
    if (finished.has(card.id)) {
      continue;
    }
    expect(json).not.toContain(JSON.stringify(card.answer));
    expect(json).not.toContain(JSON.stringify(card.ja));
    for (const alias of card.aliases ?? []) {
      expect(json).not.toContain(JSON.stringify(alias));
    }
  }
  // 山札の残り枚数と山札そのもの
  for (const key of ["deck", "cursor", "currentCardId", "cardsExplained", "usedCards", "remaining"]) {
    expect(json).not.toContain(`"${key}"`);
  }
}

describe("秘密の非混入", () => {
  it("遷移ごとに、公開状態のキーが許可リストと一致し、終えていないお題が現れない", () => {
    let live = begin(7, { seed: 21 });
    const check = (next: Live): Live => {
      expectPublicAllowlist(next);
      expectNoUnfinishedCard(next);
      return next;
    };
    check(live);
    live = check(readyAll(twoHeadedModule, live));
    while (live.stage !== STAGES.debrief) {
      live = check(startTurn(twoHeadedModule, live));
      live = check(claim(twoHeadedModule, live));
      live = check(pass(twoHeadedModule, live));
      if (live.stage === STAGES.explaining) {
        live = check(expire(twoHeadedModule, live));
      }
    }
  });

  it("役の切り替え: handoff のたびに全員へ秘密が送り直され、前の手番の説明役にお題が残らない", () => {
    let live = toFirstHandoff(6);
    const firstExplainers = explainersOf(live);
    live = expire(twoHeadedModule, startTurn(twoHeadedModule, live));
    expect(live.stage).toBe(STAGES.handoff);
    expect([...(live.lastSecrets?.keys() ?? [])].sort()).toEqual(live.players.map((player) => player.id).sort());
    for (const playerId of firstExplainers) {
      expect(live.sent.get(playerId)).toEqual({ role: "guesser" });
    }
    const explainers = explainersOf(live);
    const cards = explainers.map((playerId) => (live.sent.get(playerId) as ExplainerSecret).card);
    expect(cards[0]).toEqual(cards[1]);
    expect(cards[0]?.cardId).toBe(live.gameSecret.currentCardId);
  });

  it("当てる側の秘密にお題が届かない", () => {
    let live = startTurn(twoHeadedModule, toFirstHandoff(8));
    live = claim(twoHeadedModule, live);
    for (const player of live.players) {
      if (!explainersOf(live).includes(player.id)) {
        expect(live.sent.get(player.id)).toEqual({ role: "guesser" });
      }
    }
  });
});

describe("handleAction の前提", () => {
  it("gameSecret が無ければ invalid_stage で拒否する", () => {
    const live = toFirstHandoff(6);
    const transition = twoHeadedModule.handleAction({
      room: roomOf(live),
      publicState: live.publicState,
      gameSecret: undefined,
      playerId: "p1",
      action: ACTIONS.startTurn,
      payload: undefined,
    });
    expect(apply(live, transition).lastReject).toBe(ERROR_CODES.invalidStage);
  });
});
