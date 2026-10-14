// SECRET RULE ENGLISHの卓で、画面に出た自分の成否から規則を絞る補助（E2E）。
//
// 規則の判定は server/games/secretrule の rules.ts と同じ規則をここに写す。
// e2eはワークスペースのパッケージに依存しないため、importせずに持つ（規則を変えたらここも変える）。
// 対象は収録パック basic の候補だけである。
import { expect, type Page } from "@playwright/test";

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
  start_i: (text) => ((text.split(" ")[0] ?? "").match(/[A-Za-z0-9]/u)?.[0] ?? "").toLowerCase() === "i",
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

/** 候補一覧から、候補idと英文の対応を読む */
export async function readCandidates(page: Page): Promise<Map<string, string>> {
  const items = page.locator("[data-testid='candidate']");
  await expect(items).toHaveCount(6, { timeout: 30_000 });
  const map = new Map<string, string>();
  for (const item of await items.all()) {
    const id = (await item.getAttribute("data-candidate-id")) ?? "";
    map.set(id, ((await item.locator(".en").textContent()) ?? "").trim());
  }
  return map;
}

/** 全員の画面から、自分の英文の成否（本文 -> 通過）を集める */
export async function collectVerdicts(pages: Page[]): Promise<Map<string, boolean>> {
  const verdicts = new Map<string, boolean>();
  for (const page of pages) {
    for (const entry of await page.locator("[data-testid='tested-entry']:has([data-testid='own-verdict'])").all()) {
      const text = ((await entry.locator(".text").textContent()) ?? "").trim();
      const passed = (await entry.locator("[data-testid='own-verdict']").getAttribute("data-passed")) === "true";
      verdicts.set(text, passed);
    }
  }
  return verdicts;
}

/** 観測した成否と矛盾しない候補 */
export function consistentCandidates(candidateIds: string[], verdicts: Map<string, boolean>): string[] {
  return candidateIds.filter((id) => {
    const predicate = PREDICATES[id];
    return predicate !== undefined && [...verdicts].every(([text, passed]) => predicate(text) === passed);
  });
}

/**
 * 残った候補を最もよく分ける2文を在庫から選ぶ。
 *
 * 2文の成否の組で候補がいくつの組に分かれるかを最大にする。
 */
export function pickTests(candidateIds: string[], used: Set<string>): [string, string] {
  const unused = BANK.filter((text) => !used.has(text));
  let best: [string, string] = [unused[0]!, unused[1]!];
  let bestClasses = -1;
  for (let i = 0; i < unused.length; i += 1) {
    for (let j = i + 1; j < unused.length; j += 1) {
      const a = unused[i]!;
      const b = unused[j]!;
      const classes = new Set(candidateIds.map((id) => `${PREDICATES[id]!(a)}${PREDICATES[id]!(b)}`)).size;
      if (classes > bestClasses) {
        best = [a, b];
        bestClasses = classes;
      }
    }
  }
  return best;
}

/** 入力欄に書いて出す。受理されて提出済みの表示が出るまで待つ */
export async function submitText(page: Page, text: string): Promise<void> {
  await page.fill("[data-testid='submission-input']", text);
  await page.click("[data-testid='submit']");
}

/** タイマーバーの見出しでステージを待つ */
export async function waitForStage(pages: Page[], label: string): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(label, { timeout: 30_000 });
  }
}
