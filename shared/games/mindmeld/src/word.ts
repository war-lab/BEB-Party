// 語の正規化・照合キー・近い語の判定（基本設計/15_MINDMELDゲームモジュール.md の「語の扱い」、ADR-0034）。
//
// どの関数も文字の削除・比較・数え上げだけで閉じ、英語の意味を解釈しない（不変条件1）。
// 辞書・語形変化の表・外部のAPIを使わない。
// クライアントの入力欄とサーバの submit が同じ関数を使う（15の「照合キー」）。

/** 表示形の文字数の上限 */
export const MAX_WORD_CHARS = 24;

/** 表示形を半角空白で区切った要素の上限。`ice cream` を許し、句を出す提出を受けない */
export const MAX_WORD_PARTS = 2;

/** 照合キーの文字数の範囲 */
export const KEY_LENGTH = { min: 2, max: 20 } as const;

/**
 * 入力欄で受け付ける生の文字数の上限。
 *
 * 前後の記号は正規化で落ちるため、表示形の上限より少し長く取る。
 * 判定はサーバが表示形で行い、ここはペイロードを不要に大きくしないための止めである。
 */
export const WORD_INPUT_MAX_CHARS = 40;

/**
 * 近い語の条件の値（15の「近い語の申告と異議」）。仮置きであり、実プレイで見直す。
 */
export const NEAR_WORD = {
  /** 短い方の照合キーがこの文字数以上のときだけ近い語になりうる */
  minShortLength: 3,
  /** 一方が他方の先頭部分のとき、長さの差がこの値以下なら近い語 */
  maxPrefixGap: 3,
  /** 編集距離2を近い語とみなすのは、短い方がこの文字数以上のときに限る */
  minShortLengthForDistance2: 5,
} as const;

/**
 * 提出を表示形へ正規化する（15の「正規化」の手順1〜6）。
 *
 * 手順5の「前後にある英字以外の文字」は、Unicodeの文字（`\p{L}`）と数字（`\p{N}`）以外の文字と解釈する。
 * 記号・句読点・絵文字・空白は落とし、かなや漢字やアクセント付きの文字は残す。
 * 英字だけで前後を判定すると `catねこ` が `cat` になり、かなを含む提出を受理してしまうためである。
 * 残ったかなや数字は表示形の条件で落ちる（`invalid_word`）。
 */
export function normalizeWord(raw: string): string {
  return (
    raw
      .normalize("NFKC")
      .replace(/\p{Cf}/gu, "")
      .replace(/[‘’]/gu, "'")
      .replace(/\s+/gu, " ")
      .trim()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
      .toLowerCase()
  );
}

/** 表示形から半角空白・ハイフン・アポストロフィを除いた照合キー（15の「照合キー」） */
export function matchKeyOf(display: string): string {
  return display.replace(/[ '-]/gu, "");
}

/** 表示形の条件を満たさない理由。入力欄の案内に使う */
export type WordProblem = "empty" | "letters" | "parts" | "length" | "key_length";

export type WordCheck = { ok: true; display: string; key: string } | { ok: false; display: string; problem: WordProblem };

/**
 * 生の入力を正規化し、表示形の条件を確かめる（15の「正規化」）。
 *
 * 条件は上から順に見る。英字以外の文字、要素の数、文字数、照合キーの長さ。
 */
export function checkWord(raw: string): WordCheck {
  const display = normalizeWord(raw);
  if (display === "") {
    return { ok: false, display, problem: "empty" };
  }
  if (!/^[a-z' -]+$/u.test(display)) {
    return { ok: false, display, problem: "letters" };
  }
  if (display.split(" ").length > MAX_WORD_PARTS) {
    return { ok: false, display, problem: "parts" };
  }
  if ([...display].length > MAX_WORD_CHARS) {
    return { ok: false, display, problem: "length" };
  }
  const key = matchKeyOf(display);
  if (key.length < KEY_LENGTH.min || key.length > KEY_LENGTH.max) {
    return { ok: false, display, problem: "key_length" };
  }
  return { ok: true, display, key };
}

/**
 * お題の英文から、そのラウンドで出せない照合キーを作る（15の「使用済みの語」）。
 *
 * 英文を空白で区切った各語を正規化して照合キーにし、2文字以上のものだけを残す。
 * 同じキーは1件にまとめ、出現順を保つ。
 */
export function promptKeysOf(promptEn: string): string[] {
  const keys: string[] = [];
  for (const token of promptEn.split(/\s+/u)) {
    const key = matchKeyOf(normalizeWord(token));
    if (key.length >= KEY_LENGTH.min && !keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * 編集距離（1文字の挿入・削除・置換の最小回数）。
 *
 * 照合キーは20文字以下であり、全表を作っても計算量は問題にならない。
 */
export function editDistance(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = (previous[j - 1] as number) + (left[i - 1] === right[j - 1] ? 0 : 1);
      const deletion = (previous[j] as number) + 1;
      const insertion = (current[j - 1] as number) + 1;
      current.push(Math.min(substitution, deletion, insertion));
    }
    previous = current;
  }
  return previous[right.length] as number;
}

/**
 * 2つの照合キーが近い語か（15の「近い語の申告と異議」、ADR-0034）。
 *
 * 照合キーが一致する組は近い語ではない（完全一致として扱う）。
 * この判定は申告を受け付けるかどうかの門にだけ使い、一致の判定には使わない。
 */
export function isNearKeys(a: string, b: string): boolean {
  if (a === b) {
    return false;
  }
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < NEAR_WORD.minShortLength) {
    return false;
  }
  if (long.startsWith(short) && long.length - short.length <= NEAR_WORD.maxPrefixGap) {
    return true;
  }
  const distance = editDistance(short, long);
  if (distance === 1) {
    return true;
  }
  return distance === 2 && short.length >= NEAR_WORD.minShortLengthForDistance2;
}
