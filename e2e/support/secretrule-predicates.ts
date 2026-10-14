// SECRET RULE ENGLISHの判定の写しと英文の在庫（E2E用）。
//
// 規則の判定は server/games/secretrule の rules.ts と同じ規則をここに写す。
// e2eはワークスペースのパッケージに依存しないため、importせずに持つ。
// 写しがずれていないことは server/games/secretrule/src/e2e-predicates.test.ts が確かめる。
// 対象は収録パック basic の候補だけである。playwright に依存させない（サーバのテストから読むため）。

function wordsOf(text: string): string[] {
  return (text.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/gu) ?? []).map((word) => word.toLowerCase());
}

function countWords(text: string): number {
  return text.split(" ").filter((element) => /[A-Za-z0-9]/u.test(element)).length;
}

function lastChar(text: string): string {
  const trimmed = text.replace(/["')\]\s]+$/u, "");
  return trimmed.at(-1) ?? "";
}

function letters(word: string): number {
  return word.replace(/['-]/gu, "").length;
}

const TIME_WORDS = ["today", "tomorrow", "yesterday", "now", "tonight", "weekend", "week", "year", "month", "morning"];

/** 収録パック basic の候補id -> 判定 */
export const PREDICATES: Record<string, (text: string) => boolean> = {
  question: (text) => lastChar(text) === "?",
  no_n: (text) => !text.toLowerCase().includes("n"),
  max5: (text) => countWords(text) <= 5,
  min8: (text) => countWords(text) >= 8,
  long8: (text) => wordsOf(text).some((word) => letters(word) >= 8),
  the: (text) => wordsOf(text).includes("the"),
  time_words: (text) => wordsOf(text).some((word) => TIME_WORDS.includes(word)),
  has_f: (text) => text.toLowerCase().includes("f"),
  no_h: (text) => !text.toLowerCase().includes("h"),
  start_i: (text) =>
    ((text.split(" ").find((element) => /[A-Za-z0-9]/u.test(element)) ?? "").match(/[A-Za-z0-9]/u)?.[0] ?? "").toLowerCase() ===
    "i",
};

/** 英文の在庫。比較キーが重ならないよう、互いに語の並びが違う文だけを置く */
export const BANK: string[] = [
  "I like sushi.",
  "Do you like cats?",
  "It is very hot today.",
  "My sister is a nurse.",
  "Where do you live?",
  "I went to Osaka.",
  "The test was difficult.",
  "Coffee is my favorite drink.",
  "I watched a movie.",
  "Can you play tennis?",
  "Is it cold outside?",
  "My dog is very cute!",
  "It was a fun trip.",
  "I study English every day.",
  "What time does the meeting start tomorrow?",
  "My mother makes the best curry in Japan.",
  "Did you see the soccer game last night?",
  "I often read books on the train.",
  "I play video games after dinner.",
  "I want to eat pizza for lunch.",
  "We stayed at a nice hotel in Okinawa.",
  "Is it true that you are moving to a new apartment next month?",
  "I usually take the bus to work, but today I walked.",
  "If it is sunny tomorrow, we are going to play baseball in the park.",
  "My father likes fishing, so we often go to the river together.",
  "I was very surprised.",
  "Is your sister busy?",
  "I play golf.",
  "It was a good day.",
  "I bought a big bag at the mall for my sister.",
];
