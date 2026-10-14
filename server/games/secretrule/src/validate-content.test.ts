// 規則パックの検証12項目（基本設計/14の検証項目、テスト観点「検証」）。
//
// 1項目だけを壊したパックで、その項目が落ちることを確かめる。
// 検証6・7・12は文例集の構成で決まるため、テスト用の文例集を渡して確かめる。
import { describe, expect, it } from "vitest";
import { CORPUS, readCorpus } from "./corpus";
import { validCandidates, validPack } from "./test-support/fixtures";
import { THRESHOLDS, measurePack, validatePack, type ValidationItem } from "./validate-content";

// 文例集に依存しない項目だけを見るときの文例集。検証8・12は落ちるが、ここでは見ない
const EMPTY_CORPUS = { sentences: [] };

function itemsOf(content: unknown, corpus: unknown = EMPTY_CORPUS): ValidationItem[] {
  return validatePack(content, corpus).findings.map((finding) => finding.item);
}

/** 文例集に依存する検証（6・7・8・12）を除いた項目 */
function corpusFreeItems(content: unknown): ValidationItem[] {
  return itemsOf(content).filter((item) => ![6, 7, 8, 12].includes(item as number));
}

describe("検証1（スキーマ）", () => {
  it("基準のパックは文例集に依存しない項目をすべて通る", () => {
    expect(corpusFreeItems(validPack())).toEqual([]);
  });

  it("定義に無い欄を、入れ子の中まで落とす", () => {
    const pack = validPack() as unknown as Record<string, unknown>;
    expect(itemsOf({ ...pack, answer: "no_i" })).toContain("schema");
    const candidates = validCandidates().map((entry, index) => (index === 0 ? { ...entry, secret: true } : entry));
    expect(itemsOf({ ...pack, candidates })).toContain("schema");
  });

  it("未知の規則IDを落とす", () => {
    const pack = validPack();
    const candidates = [...pack.candidates, { id: "past", ruleId: "past_tense", params: {} }];
    expect(itemsOf({ ...pack, candidates })).toContain("schema");
  });
});

describe("検証2〜5", () => {
  it("検証2: idの形と候補idの重複", () => {
    expect(corpusFreeItems({ ...validPack(), id: "Bad-Id" })).toContain(2);
    const pack = validPack();
    const candidates = pack.candidates.map((entry, index) => (index === 1 ? { ...entry, id: "no_i" } : entry));
    expect(corpusFreeItems({ ...pack, candidates })).toContain(2);
  });

  it("検証3: 候補が8件未満、同じ規則IDが3件以上", () => {
    const pack = validPack();
    expect(corpusFreeItems({ ...pack, candidates: pack.candidates.slice(0, 7) })).toContain(3);
    const crowded = [
      ...pack.candidates,
      { id: "min5", ruleId: "min_words", params: { n: 5 } },
      { id: "min6", ruleId: "min_words", params: { n: 6 } },
    ];
    expect(corpusFreeItems({ ...pack, candidates: crowded })).toContain(3);
  });

  it("検証4: パラメータの範囲、語の形、1文字の語、重複", () => {
    const replace = (entry: unknown) => {
      const pack = validPack();
      return { ...pack, candidates: [...pack.candidates.slice(1), entry] };
    };
    expect(corpusFreeItems(replace({ id: "x", ruleId: "min_words", params: { n: 10 } }))).toContain(4);
    expect(corpusFreeItems(replace({ id: "x", ruleId: "has_word", params: { words: ["e"] } }))).toContain(4);
    expect(corpusFreeItems(replace({ id: "x", ruleId: "has_word", params: { words: ["Red", "red"] } }))).toContain(4);
    expect(corpusFreeItems(replace({ id: "x", ruleId: "has_word", params: { words: ["ice-cream"] } }))).toContain(4);
    expect(corpusFreeItems(replace({ id: "x", ruleId: "no_letter", params: { letter: "E" } }))).toContain(4);
    expect(corpusFreeItems(replace({ id: "x", ruleId: "ends_with", params: { mark: "." } }))).toContain(4);
    // a と I は1文字の語として受理する
    expect(corpusFreeItems(replace({ id: "x", ruleId: "no_word", params: { words: ["I"] } }))).not.toContain(4);
  });

  it("検証5: 言い回しの欠落、穴の過不足、未知の規則ID", () => {
    const pack = validPack();
    const { min_words: _drop, ...rest } = pack.rulePhrases;
    expect(corpusFreeItems({ ...pack, rulePhrases: rest })).toContain(5);
    expect(
      corpusFreeItems({ ...pack, rulePhrases: { ...pack.rulePhrases, min_words: { en: "Use many words.", ja: "{n}語以上" } } }),
    ).toContain(5);
    expect(
      corpusFreeItems({
        ...pack,
        rulePhrases: { ...pack.rulePhrases, min_words: { en: "Use {n} words with {letter}.", ja: "{n}語以上" } },
      }),
    ).toContain(5);
    expect(
      corpusFreeItems({ ...pack, rulePhrases: { ...pack.rulePhrases, unknown_rule: { en: "x", ja: "x" } } }),
    ).toContain(5);
  });
});

describe("検証9〜11", () => {
  it("検証9: keyExpressions と starters の下限", () => {
    const pack = validPack();
    expect(corpusFreeItems({ ...pack, keyExpressions: pack.keyExpressions.slice(0, 2) })).toContain(9);
    expect(corpusFreeItems({ ...pack, starters: pack.starters.slice(0, 2) })).toContain(9);
  });

  it("検証10: starters の空欄", () => {
    const pack = validPack();
    const starters = [...pack.starters.slice(1), { en: "My favorite food is pizza.", ja: "好きな食べ物はピザ" }];
    expect(corpusFreeItems({ ...pack, starters })).toContain(10);
  });

  it("検証11: 空白だけの ja", () => {
    const pack = validPack();
    const keyExpressions = [...pack.keyExpressions.slice(1), { en: "Mine passed.", ja: " " }];
    expect(corpusFreeItems({ ...pack, keyExpressions })).toContain(11);
  });
});

describe("文例集に依存する検証（6・7・8・12）", () => {
  it("検証6: 文例集で満たす文の割合が範囲を外れる候補を落とす", () => {
    // すべての文が I を含むため、no_i の通過率は0%になる
    const corpus = { sentences: Array.from({ length: 60 }, (_, index) => `I have ${index + 3} cats.`) };
    const findings = validatePack(validPack(), corpus).findings;
    expect(findings.some((finding) => finding.item === 6 && finding.candidateId === "no_i")).toBe(true);
  });

  it("検証7: 一方が他方を含む組（min_words の6と7）を足すと、その組の指摘が新しく出る", () => {
    const pack = validPack();
    const corpus = readCorpus(CORPUS);
    const pairMessage = (content: unknown) =>
      validatePack(content, corpus)
        .findings.filter((finding) => finding.item === 7)
        .map((finding) => finding.message)
        .filter((message) => message.includes("min6"));
    // min6 を持たない基準のパックでは、min6 に関わる指摘は出ない
    expect(pairMessage(pack)).toEqual([]);
    // min7 を満たす文は必ず min6 を満たすため、min7>min6 の割合は0になる
    const withMin6 = { ...pack, candidates: [...pack.candidates, { id: "min6", ruleId: "min_words", params: { n: 6 } }] };
    expect(pairMessage(withMin6)).toContain("min7を満たしmin6を満たさない文の割合は5.0%以上である必要がある");
  });

  it("検証8: 文例集の件数、提出条件、比較キーの重複", () => {
    const short = { sentences: ["I like cats.", "i like cats", "Hi!"] };
    const messages = validatePack(validPack(), short)
      .findings.filter((finding) => finding.item === 8)
      .map((finding) => finding.message);
    expect(messages.some((message) => message.includes(`${THRESHOLDS.minCorpus}件以上`))).toBe(true);
    expect(messages.some((message) => message.includes("提出の条件"))).toBe(true);
    expect(messages.some((message) => message.includes("比較キー"))).toBe(true);
    expect(validatePack(validPack(), { sentences: "broken" }).findings.some((finding) => finding.item === 8)).toBe(true);
  });

  it("検証12: 文例集の構成の比率", () => {
    // 疑問文も感嘆文も長い文も無い
    const corpus = { sentences: Array.from({ length: 60 }, (_, index) => `We have ${index + 3} cats.`) };
    const messages = validatePack(validPack(), corpus)
      .findings.filter((finding) => finding.item === 12)
      .map((finding) => finding.message);
    expect(messages.some((message) => message.startsWith("? で終わる"))).toBe(true);
    expect(messages.some((message) => message.startsWith("! で終わる"))).toBe(true);
    expect(messages.some((message) => message.startsWith("10語以上"))).toBe(true);
  });
});

describe("閾値すれすれの警告", () => {
  it("通過率が閾値に近い候補は、合否を変えずに警告を出す", () => {
    // question の通過率を 16%（下限15%から3pt以内）にする
    const sentences = Array.from({ length: 100 }, (_, index) => (index < 16 ? `Is it ${index + 3} now?` : `We have ${index + 3} cats.`));
    const findings = validatePack(validPack(), { sentences }).findings;
    const question = findings.filter((finding) => finding.candidateId === "question" && finding.item === 6);
    expect(question.map((finding) => finding.severity)).toEqual(["warning"]);
  });
});

describe("measurePack", () => {
  it("母集団の各候補の通過率と、全順序対の割合を出す", () => {
    const candidates = validCandidates();
    const measured = measurePack(candidates, { sentences: ["Do I like red?", "You have a cat."] });
    expect(Object.keys(measured.passRates)).toHaveLength(candidates.length);
    expect(Object.keys(measured.separations)).toHaveLength(candidates.length * (candidates.length - 1));
    expect(measured.passRates.question).toBe(0.5);
    expect(measured.separations["question>no_i"]).toBe(0.5);
  });
});

