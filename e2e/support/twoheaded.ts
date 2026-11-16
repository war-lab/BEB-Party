// TWO-HEADED SPEAKERの卓を画面の操作で進める補助（E2E）。
//
// どの端末がどのペアか、いま説明役かは画面から読む。サーバの状態を直接覗かない。
import { expect, type Page } from "@playwright/test";

/** タイマーバーの見出しでステージを待つ */
export async function waitForStage(pages: Page[], label: string, timeout = 30_000): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(label, { timeout });
  }
}

/** briefing の画面から、自分のペアの teamId を読む */
export async function readMyTeam(page: Page): Promise<string> {
  const chip = page.locator("[data-testid='team-list'] li.mine [data-testid='pair-chip']");
  await expect(chip).toHaveCount(1, { timeout: 30_000 });
  return (await chip.getAttribute("data-team-id")) ?? "";
}

/** briefing の画面から、ペアの並び（説明する順）を読む */
export async function readTeamOrder(page: Page): Promise<string[]> {
  return page
    .locator("[data-testid='team-list'] [data-testid='pair-chip']")
    .evaluateAll((chips) => chips.map((chip) => chip.getAttribute("data-team-id") ?? ""));
}

/** 全員が「準備できた」を押す。最後の1人で交代へ進む */
export async function readyAll(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.click("[data-testid='ready']");
    await expect(
      page.locator("[data-testid='ready']:disabled, [data-testid='stage-timer']:has-text('交代')").first(),
    ).toBeVisible({ timeout: 10_000 });
  }
}

/** 説明役の端末でお題の伏せ面を開き、カットインのお題を読む */
export async function openCutIn(page: Page): Promise<string> {
  await page.click("[data-testid='explainer-cover']");
  const answer = page.locator("[data-testid='cutin-answer']");
  await expect(answer).toBeVisible({ timeout: 10_000 });
  return ((await answer.textContent()) ?? "").trim();
}

/** 説明タイムで説明役の画面に出ているお題を読む */
export async function readAnswer(page: Page): Promise<string> {
  const answer = page.locator("[data-testid='answer']");
  await expect(answer).toBeVisible({ timeout: 10_000 });
  return ((await answer.textContent()) ?? "").trim();
}

/** 「正解」から当てたペアを選んで申告する。シートが閉じるまで待つ */
export async function claimCorrect(page: Page, teamId: string): Promise<void> {
  await page.click("[data-testid='claim-open']");
  await page.click(`[data-testid='claim-sheet'] [data-testid='claim-team'][data-team-id='${teamId}']`);
  await expect(page.locator("[data-testid='claim-sheet']")).toHaveCount(0, { timeout: 10_000 });
}
