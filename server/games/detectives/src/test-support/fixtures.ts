// 検証テスト用の事件データ。本番の事件として扱われないよう content/ の外に置く（M1 PR6）。
//
// 基準となる正常な事件（validCase）を作り、テスト側が1項目だけを壊して
// 「その項目だけが落ちる」ことを確かめる。
import type { Level } from "@beb/shared-core";
import type { Case, Character, Contradiction, Fact, LevelText, Variant } from "@beb/shared-detectives";

/** レベル1〜5の英文。レベル1は8語以内、レベル5は15語以上（04の英文長リント）に収める */
export function levelText(core: string): LevelText {
  return {
    "1": `${core}.`,
    "2": `I think ${core}.`,
    "3": `As I remember it, ${core} that afternoon.`,
    "4": `Now that you mention it, ${core}, or something very close to that.`,
    "5": `I would not swear to it, but I do believe ${core}, as far as I can now recall from that afternoon.`,
  };
}

export function character(id: string, recommendedLevel: Level, merge5p: string | null = null): Character {
  return { id, name: `${id} (role)`, recommendedLevel, merge5p };
}

export function fact(id: string, owner: string, value: string, core: string): Fact {
  return {
    id,
    owner,
    value,
    disclosure: "free",
    text: levelText(core),
    hintJa: "語義のみを書く",
  };
}

export function contradiction(requires: string[], yieldsSymbol: string, requires5p: string[] | null = null): Contradiction {
  return { requires, requires5p, yields: yieldsSymbol, meaningJa: "突き合わせの意味をここに書く" };
}

export function variant(
  culprit: string,
  replaces: string,
  lieValue: string,
  contradictions: Contradiction[],
): Variant {
  return {
    culprit,
    lie: {
      replaces,
      value: lieValue,
      text: levelText("I was somewhere else at the time"),
      hintJa: "語義のみを書く",
    },
    contradictions,
  };
}

export function caseOf(parts: {
  id: string;
  playerCount: [number, number];
  characters: Character[];
  facts: Fact[];
  variants: Variant[];
}): Case {
  return {
    id: parts.id,
    playerCount: parts.playerCount,
    title: "Fixture Case",
    briefing: { ja: "検証用の事件である", en: "A fixture case for validation tests." },
    characters: parts.characters,
    facts: parts.facts,
    variants: parts.variants,
    reveal: {
      timelineEn: ["14:00 The group met.", "14:20 The item disappeared."],
      keyExpressions: [{ en: "I was about to leave when...", ja: "ちょうど出ようとしていたら…" }],
    },
  };
}

/**
 * 7項目すべてを満たす6人の事件。
 *
 * 各バリアントの矛盾は「犯人の嘘 + 他5人全員の証言」を要求する。
 * 検証1が「yieldsを1つ以上含む」であるため、途中結論を持つ多段構成にすると
 * 検証2（1人を除くと不成立）を満たせなくなる。基準の事件は1段にする。
 */
export function validCase(): Case {
  const characters = [
    character("c1", 1),
    character("c2", 2),
    character("c3", 3),
    character("c4", 4),
    character("c5", 5),
    // 5人版ではc6をc5へ統合する
    character("c6", 3, "c5"),
  ];
  const facts = [
    fact("f1", "c1", "stmt_one", "the door was open at two"),
    fact("f2", "c2", "stmt_two", "the counter was empty for a while"),
    fact("f3", "c3", "stmt_three", "someone left through the back"),
    fact("f4", "c4", "stmt_four", "the bag was still there at ten past"),
    fact("f5", "c5", "stmt_five", "nobody used the side table"),
    fact("f6", "c6", "stmt_six", "the window was shut all afternoon"),
  ];
  const allFacts = facts.map((entry) => entry.id);
  const variants = characters.map((entry, index) =>
    variant(entry.id, `f${index + 1}`, `false_claim_${index + 1}`, [
      contradiction(allFacts, `${entry.id}_exposed`),
    ]),
  );

  return caseOf({ id: "fixture_valid_v1", playerCount: [5, 6], characters, facts, variants });
}

/**
 * 多段推論を含む事件。
 *
 * 2段目（c1#1）の直接のrequiresに含まれる犯人以外の事実はf4だけであり、
 * 展開しない実装では検証3が落ちる。step_oneを展開するとf2・f3まで辿れるため、
 * 推移的な展開を行う実装では検証3が成立する。
 */
export function multiStepCase(): Case {
  const characters = [character("c1", 3), character("c2", 3), character("c3", 3), character("c4", 3)];
  const facts = [
    fact("f1", "c1", "stmt_one", "the door was open at two"),
    fact("f2", "c2", "stmt_two", "the counter was empty for a while"),
    fact("f3", "c3", "stmt_three", "someone left through the back"),
    fact("f4", "c4", "stmt_four", "the bag was still there at ten past"),
  ];
  const variants = [
    variant("c1", "f1", "false_claim_one", [
      contradiction(["f1", "f2", "f3"], "step_one"),
      contradiction(["f1", "step_one", "f4"], "c1_exposed"),
    ]),
  ];
  return caseOf({ id: "fixture_multistep_v1", playerCount: [4, 4], characters, facts, variants });
}

/**
 * バリアント間で同じ嘘（lie.value）を使う事件。
 *
 * c1が犯人の回でも、c2を指す矛盾が同時に発火する。実プレイでは無実のc2が黒く見える。
 * c1が2つの事実を持つのは、c2の矛盾が「c1の差し替えられていない事実」を要求できるようにするためである。
 */
export function sharedLieCase(): Case {
  const characters = [character("c1", 3), character("c2", 3), character("c3", 3)];
  const facts = [
    fact("f1a", "c1", "stmt_one_a", "the door was open at two"),
    fact("f1b", "c1", "stmt_one_b", "the lights were on upstairs"),
    fact("f2", "c2", "stmt_two", "the counter was empty for a while"),
    fact("f3", "c3", "stmt_three", "someone left through the back"),
  ];
  const shared = "false_claim_shared";
  const variants = [
    variant("c1", "f1a", shared, [contradiction(["f1a", "f2", "f3"], "c1_exposed")]),
    variant("c2", "f2", shared, [contradiction(["f2", "f1b", "f3"], "c2_exposed")]),
  ];
  return caseOf({ id: "fixture_shared_lie_v1", playerCount: [3, 3], characters, facts, variants });
}

/**
 * 犯人以外1人の証言だけで嘘が割れる事件（検証3のみに違反する）。
 *
 * 犯人以外がc2しかいないため検証2は成立するが、矛盾の所有者が1人しかいない。
 */
export function soloOwnerCase(): Case {
  const characters = [character("c1", 3), character("c2", 3)];
  const facts = [
    fact("f1", "c1", "stmt_one", "the door was open at two"),
    fact("f2a", "c2", "stmt_two_a", "the counter was empty for a while"),
    fact("f2b", "c2", "stmt_two_b", "the lights were on upstairs"),
  ];
  const variants = [variant("c1", "f1", "false_claim_one", [contradiction(["f1", "f2a", "f2b"], "c1_exposed")])];
  return caseOf({ id: "fixture_solo_owner_v1", playerCount: [2, 2], characters, facts, variants });
}

/**
 * 統合によって矛盾の所有者が犯人以外1人になる事件（requires5p未指定）。
 *
 * c3をc2へ統合すると、c1の矛盾はc2の証言2枚だけで成立する。
 */
export function mergeGapCase(): Case {
  const characters = [character("c1", 3), character("c2", 3), character("c3", 3, "c2")];
  const facts = [
    fact("f1", "c1", "stmt_one", "the door was open at two"),
    fact("f2", "c2", "stmt_two", "the counter was empty for a while"),
    fact("f3", "c3", "stmt_three", "someone left through the back"),
  ];
  const variants = [variant("c1", "f1", "false_claim_one", [contradiction(["f1", "f2", "f3"], "c1_exposed")])];
  return caseOf({ id: "fixture_merge_gap_v1", playerCount: [2, 3], characters, facts, variants });
}
