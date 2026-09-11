// 旧版で保存された秘密情報・結果を、現行の形へ補う。
//
// 部屋の再接続では、サーバは保存済みの秘密情報と結果を**そのまま**返す
// （`server/core/src/room-do.ts` の `reconnectPlayer` と `sendLastResult`）。
// 秘密情報が作り直されるのはカードが進んだときだけである。
//
// したがってデプロイをまたいだ部屋では、`ja` と `aliases` を持たない payload が
// 新しい画面へ届く。画面は `aliases.length` を直接読むため、補わないと描画時に例外になる。
// 部屋の有効期限は最終アクセスから2時間（`ROOM_EXPIRE_MS`）であり、
// 遊んでいる最中にデプロイすれば当たる。
//
// ここで補うのは形だけであり、内容の古さは直せない。
// 旧版の禁止語がそのまま表示される（提示数も旧版のまま）。
// 再接続時に秘密情報を作り直すのが本来の解であり、それには
// 共通コアへゲームモジュールを呼ぶ口が必要になる（Issue #29）。
import type { DontSayItResult, DontSayItSecret } from "./game";

/** 旧版の秘密情報は `ja` と `aliases` を持たない。読む側では省略されうるものとして扱う */
type LegacySpeakerCard = {
  cardId: string;
  answer: string;
  taboo: string[];
  ja?: string;
  aliases?: string[];
};

function normalizeCard(card: LegacySpeakerCard) {
  return {
    cardId: card.cardId,
    answer: card.answer,
    taboo: [...card.taboo],
    ja: card.ja ?? "",
    aliases: [...(card.aliases ?? [])],
  };
}

/**
 * 秘密情報を現行の形へ補う。`null` はそのまま返す。
 *
 * 欠けた `ja` は空文字にする。表示側は空なら日本語名の行を出さない。
 * 欠けた `aliases` は空配列にする。旧版には別名の概念がなく、
 * 「別名は無し」として扱うのが旧版の挙動と一致する。
 */
export function normalizeSecret(payload: unknown): DontSayItSecret | null {
  if (payload === null || typeof payload !== "object") {
    return null;
  }
  const secret = payload as { role?: unknown };
  if (secret.role === "speaker") {
    const source = payload as { role: "speaker"; card: LegacySpeakerCard };
    return { role: "speaker", card: normalizeCard(source.card) };
  }
  if (secret.role === "watcher") {
    const source = payload as {
      role: "watcher";
      cardId: string;
      taboo: string[];
      answer: string;
      ja?: string;
      aliases?: string[];
    };
    return {
      role: "watcher",
      cardId: source.cardId,
      taboo: [...source.taboo],
      answer: source.answer,
      ja: source.ja ?? "",
      aliases: [...(source.aliases ?? [])],
    };
  }
  if (secret.role === "answerer") {
    return { role: "answerer" };
  }
  // 未知のroleは扱わない。画面はnullを「秘密情報なし」として描く
  return null;
}

/**
 * 結果を現行の形へ補う。`null` はそのまま返す。
 *
 * 旧版の `usedCards` は `ja` を持たない。講評の日本語名の行が空になるだけで例外にはならないが、
 * `undefined` が文字列として出るのを避けるために補う。
 */
export function normalizeResult(payload: unknown): DontSayItResult | null {
  if (payload === null || typeof payload !== "object") {
    return null;
  }
  const source = payload as {
    usedCards?: { answer: string; taboo: string[]; ja?: string }[];
  };
  if (!Array.isArray(source.usedCards)) {
    return payload as DontSayItResult;
  }
  return {
    ...(payload as DontSayItResult),
    usedCards: source.usedCards.map((card) => ({
      answer: card.answer,
      taboo: [...card.taboo],
      ja: card.ja ?? "",
    })),
  };
}
