// SECRET RULE ENGLISHの卓で、画面に出た自分の成否から規則を絞る補助（E2E）。
//
// 判定の写しと英文の在庫は secretrule-predicates.ts に置く。
import { expect, type Page } from "@playwright/test";
import { BANK, PREDICATES } from "./secretrule-predicates";

export { BANK, PREDICATES };

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

/**
 * 入力欄に書いて出す。受理されて提出済みの表示が出るまで待つ。
 *
 * 最後の1人の提出では、受理と同時に次のステージへ進んで入力欄が消えるため、どちらかを待つ。
 */
export async function submitText(page: Page, text: string): Promise<void> {
  await page.fill("[data-testid='submission-input']", text);
  await page.click("[data-testid='submit']");
  const accepted = page
    .locator("[data-testid='submitted-hint']")
    .or(page.locator("[data-testid='draft'], [data-testid='answer-status'], [data-testid='outcome']"))
    .or(page.locator("[data-testid='duplicate-hint']"));
  await expect(accepted.first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-testid='duplicate-hint']"), `重複で拒否された: ${text}`).toHaveCount(0);
}

/** タイマーバーの見出しでステージを待つ */
export async function waitForStage(pages: Page[], label: string): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(label, { timeout: 30_000 });
  }
}
