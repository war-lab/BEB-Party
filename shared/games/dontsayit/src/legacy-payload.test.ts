// 旧版で保存された秘密情報・結果が新しい画面へ届く経路の回帰テスト。
//
// 再接続ではサーバが保存済みをそのまま返すため（room-do.ts の reconnectPlayer / sendLastResult）、
// デプロイをまたいだ部屋では ja と aliases を持たない payload が届く。
// 画面は aliases.length を直接読むため、補わないと描画時に例外になる。
import { describe, expect, it } from "vitest";
import { normalizeResult, normalizeSecret } from "./legacy-payload";

describe("normalizeSecret: 旧版の説明者の秘密情報", () => {
  // 禁止語5語時代の形。ja と aliases が無い
  const legacySpeaker = {
    role: "speaker",
    card: { cardId: "card_001", answer: "Doraemon", taboo: ["cat", "robot", "pocket", "blue", "bell"] },
  };

  it("aliasesを空配列で補う", () => {
    const secret = normalizeSecret(legacySpeaker);
    expect(secret?.role).toBe("speaker");
    if (secret?.role !== "speaker") {
      throw new Error("roleがspeakerでない");
    }
    expect(secret.card.aliases).toEqual([]);
  });

  it("補った結果はlengthを読んでも落ちない（画面が直接読む形）", () => {
    const secret = normalizeSecret(legacySpeaker);
    if (secret?.role !== "speaker") {
      throw new Error("roleがspeakerでない");
    }
    expect(secret.card.aliases.length).toBe(0);
  });

  it("jaを空文字で補う", () => {
    const secret = normalizeSecret(legacySpeaker);
    if (secret?.role !== "speaker") {
      throw new Error("roleがspeakerでない");
    }
    expect(secret.card.ja).toBe("");
  });

  it("禁止語と正解は旧版の内容をそのまま残す。形だけを補い内容は直さない", () => {
    const secret = normalizeSecret(legacySpeaker);
    if (secret?.role !== "speaker") {
      throw new Error("roleがspeakerでない");
    }
    expect(secret.card.taboo).toEqual(["cat", "robot", "pocket", "blue", "bell"]);
    expect(secret.card.answer).toBe("Doraemon");
  });

  it("現行の形はそのまま通す", () => {
    const secret = normalizeSecret({
      role: "speaker",
      card: { cardId: "card_001", answer: "Doraemon", ja: "ドラえもん", aliases: ["Nobita"], taboo: ["cat"] },
    });
    if (secret?.role !== "speaker") {
      throw new Error("roleがspeakerでない");
    }
    expect(secret.card.ja).toBe("ドラえもん");
    expect(secret.card.aliases).toEqual(["Nobita"]);
  });
});

describe("normalizeSecret: 旧版の監視役の秘密情報", () => {
  const legacyWatcher = {
    role: "watcher",
    cardId: "card_001",
    taboo: ["cat", "robot"],
    answer: "Doraemon",
  };

  it("jaとaliasesを補う", () => {
    const secret = normalizeSecret(legacyWatcher);
    if (secret?.role !== "watcher") {
      throw new Error("roleがwatcherでない");
    }
    expect(secret.ja).toBe("");
    expect(secret.aliases).toEqual([]);
    expect(secret.aliases.length).toBe(0);
  });

  it("禁止語と正解は残す", () => {
    const secret = normalizeSecret(legacyWatcher);
    if (secret?.role !== "watcher") {
      throw new Error("roleがwatcherでない");
    }
    expect(secret.taboo).toEqual(["cat", "robot"]);
    expect(secret.answer).toBe("Doraemon");
  });
});

describe("normalizeSecret: それ以外", () => {
  it("回答者はそのまま通す", () => {
    expect(normalizeSecret({ role: "answerer" })).toEqual({ role: "answerer" });
  });

  it("nullはnullを返す", () => {
    expect(normalizeSecret(null)).toBeNull();
  });

  it("未知のroleはnullを返す。画面は秘密情報なしとして描く", () => {
    expect(normalizeSecret({ role: "unknown" })).toBeNull();
  });

  it("オブジェクトでない値はnullを返す", () => {
    expect(normalizeSecret("speaker")).toBeNull();
  });
});

describe("normalizeResult: 旧版の結果", () => {
  it("usedCardsのjaを補う", () => {
    const result = normalizeResult({
      scores: [],
      rounds: [],
      usedCards: [{ answer: "Doraemon", taboo: ["cat"] }],
      keyExpressions: [],
    });
    expect(result?.usedCards).toEqual([{ answer: "Doraemon", ja: "", taboo: ["cat"] }]);
  });

  it("現行の形はそのまま通す", () => {
    const result = normalizeResult({
      scores: [],
      rounds: [],
      usedCards: [{ answer: "Doraemon", ja: "ドラえもん", taboo: ["cat"] }],
      keyExpressions: [],
    });
    expect(result?.usedCards[0]?.ja).toBe("ドラえもん");
  });

  it("usedCardsが配列でなければそのまま返す", () => {
    expect(normalizeResult({ scores: [], rounds: [], keyExpressions: [] })).toEqual({
      scores: [],
      rounds: [],
      keyExpressions: [],
    });
  });

  it("nullはnullを返す", () => {
    expect(normalizeResult(null)).toBeNull();
  });
});
