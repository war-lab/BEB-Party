// SECRET TEAMSの卓を画面の操作で進める補助（E2E）。
//
// どの端末がどのチームかは、各端末に配られた自分のテーマ（画面の「あなたのチーム」）から読む。サーバの状態を直接覗かない。
import { expect, type Page } from "@playwright/test";

/** 1台の端末が自分の画面から読める値 */
export interface Seat {
  page: Page;
  playerId: string;
  themeId: string;
  word: string;
}

/** タイマーバーの見出しでステージを待つ */
export async function waitForStage(pages: Page[], label: string): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(label, { timeout: 30_000 });
  }
}

/** briefing で伏せ面を開いてカットインを閉じ、自分のid・テーマ・単語を画面から読む */
export async function openSeat(page: Page): Promise<Seat> {
  await page.click("[data-testid='word-cover']");
  await expect(page.locator("[data-testid='word-card']")).toBeVisible({ timeout: 10_000 });
  await page.click("[data-testid='word-confirm']");
  const card = page.locator("[data-testid='my-card']");
  await expect(card).toBeVisible({ timeout: 10_000 });
  const self = page.locator("[data-testid='speaker-order'] li[data-self='true']");
  await expect(self).toHaveCount(1);
  return {
    page,
    playerId: (await self.getAttribute("data-player-id")) ?? "",
    themeId: (await card.getAttribute("data-theme-id")) ?? "",
    word: ((await page.locator("[data-testid='my-word']").textContent()) ?? "").trim(),
  };
}

/** 画面の本文に、英単語が語として現れるか（部分一致で別の語に当たらないよう語境界で見る） */
export async function screenShowsWord(page: Page, word: string): Promise<boolean> {
  const text = await page.locator("main").innerText();
  const escaped = word.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`).test(text);
}

/** 全員が「読んだ」を押す。最後の1人で最初の手番へ進む */
export async function clickReady(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.click("[data-testid='ready']");
  }
}

/** 手番 turnIndex の clue 画面を待ち、手番の人のidを読む */
export async function waitForTurn(page: Page, turnIndex: number): Promise<string> {
  await expect(page.locator(`[data-testid='clue'][data-turn-index='${turnIndex}']`)).toBeVisible({ timeout: 30_000 });
  return (await page.locator("[data-testid='current-speaker']").getAttribute("data-player-id")) ?? "";
}

/** 味方と相手のテーマを選んで送り、受理されて回答済みの表示が出るか、最後の1人の回答で結果へ進むまで待つ */
export async function submitAnswer(page: Page, allyIds: string[], opponentThemeId: string): Promise<void> {
  // いま選んでいる味方を外してから選び直す（上限に達すると他の人を選べないため）
  for (const selected of await page.locator("[data-testid='ally-option'][aria-pressed='true']").all()) {
    await selected.click();
  }
  for (const allyId of allyIds) {
    await page.click(`[data-testid='ally-option'][data-player-id='${allyId}']`);
  }
  await page.click(`[data-testid='theme-option'][data-theme-id='${opponentThemeId}']`);
  await page.click("[data-testid='submit-answer']");
  const accepted = page
    .locator("[data-testid='submitted-hint']:has-text('送りました。')")
    .or(page.locator("[data-testid='winner']"));
  await expect(accepted.first()).toBeVisible({ timeout: 10_000 });
}
