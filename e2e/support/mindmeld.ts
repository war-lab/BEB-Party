// MIND MELDの卓を画面の操作で進める補助（E2E）。
//
// どの端末がどのチームか、この試行で語を出すかは画面から読む。サーバの状態を直接覗かない。
import { expect, type Page } from "@playwright/test";

/** タイマーバーの見出しでステージを待つ */
export async function waitForStage(pages: Page[], label: string): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(label, { timeout: 30_000 });
  }
}

/** briefing の画面から、自分のチームのidを読む */
export async function readMyTeam(page: Page): Promise<string> {
  const chip = page.locator("[data-testid='team-list'] li.mine [data-testid='team-chip']");
  await expect(chip).toHaveCount(1, { timeout: 30_000 });
  return (await chip.getAttribute("data-team-id")) ?? "";
}

/**
 * 重ならない語を作る。left は a〜m、right は n〜z の6文字であり、左右の組は近い語にならない。
 * お題の語にも当たらない（単体テストの syntheticWord と同じ作り方）。
 */
export function syntheticWord(index: number, side: "left" | "right"): string {
  const base = side === "left" ? 97 : 110;
  let rest = index;
  let word = "";
  for (let position = 0; position < 6; position += 1) {
    word = String.fromCharCode(base + (rest % 13)) + word;
    rest = Math.floor(rest / 13);
  }
  return word;
}

/** この試行で語を出す端末か。input の画面が出るまで待ってから判定する */
export async function isActive(page: Page): Promise<boolean> {
  const either = page.locator("[data-testid='word-input'], [data-testid='waiting-turn']");
  await expect(either.first()).toBeVisible({ timeout: 30_000 });
  return page.locator("[data-testid='word-input']").isVisible();
}

/**
 * 語を入力して出す。受理されて提出済みの表示が出るか、最後の1人の提出で開示へ進むまで待つ。
 */
export async function submitWord(page: Page, word: string): Promise<void> {
  await page.fill("[data-testid='word-input']", word);
  await page.click("[data-testid='submit-word']");
  const accepted = page
    .locator("[data-testid='submitted-hint']")
    .or(page.locator("[data-testid='countdown'], [data-testid='reveal-list']"));
  await expect(accepted.first()).toBeVisible({ timeout: 10_000 });
}

/** 開示のカウントダウンが終わり、全チームの語が出るまで待つ */
export async function waitForReveal(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='reveal-list']")).toBeVisible({ timeout: 30_000 });
  }
}

/** 全員が「次へ」を押す。最後の1人で次のステージへ進む */
export async function clickReady(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.click("[data-testid='ready']");
  }
}
