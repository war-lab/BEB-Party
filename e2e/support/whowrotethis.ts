// WHO WROTE THIS? の通し操作。複数のspecが同じ導線を使うため共通化する。
//
// 進行の待ち方には2つの規則がある。
// 1. ページを1つずつ順に操作しない。最後の指名でサーバが答え合わせへ進むため、
//    作者のページを最後に見ると、そのページは次の件の指名画面を見てしまう（実測）。
// 2. 件番号はタイマーバーの見出しで固定する。ステージが進んでも取り違えない。
import { expect, type Page } from "@playwright/test";

export const GAME_TITLE = "WHO WROTE THIS?";
export const PACK_TITLE = "日常";
export const ROUNDS = 2;

/** ホストがWHO WROTE THIS?とお題パックを選び、英作文を最短にして開始する */
export async function startWhoWroteThis(host: Page, writingSeconds = 60): Promise<void> {
  await host.click(`.title-card:has-text("${GAME_TITLE}")`);
  await host.click(`.content-chip:has-text("${PACK_TITLE}")`);
  await host.fill("label.seconds input[type='number']", String(writingSeconds));
  // onchangeで送るため、focusを外して確定させる
  await host.locator("label.seconds input[type='number']").blur();
  await host.click(".beb-btn:has-text('ゲームスタート')");
}

/** 全員が質問を確認してreadyを送る */
export async function confirmQuestion(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='ready']")).toBeVisible({ timeout: 20_000 });
    await page.click("[data-testid='ready']");
  }
}

/**
 * 各自が英文を提出する。`textOf` が各ページの本文を決める。
 *
 * 全員に同じ文を返させると、同一提出の経路（作者の判定）を通せる。
 */
export async function submitAll(pages: Page[], textOf: (index: number) => string): Promise<void> {
  for (const [index, page] of pages.entries()) {
    const input = page.locator("[data-testid='submission-input']");
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.fill(textOf(index));
    await expect(page.locator("[data-testid='submit']")).toBeEnabled();
    await page.click("[data-testid='submit']");
  }
}

/**
 * 表示中の1件に、作者以外の全員が指名する。
 *
 * 作者の端末には候補が出ず待機表示になる（基本設計/11の「作者は自分の件で指名しない」）。
 * 作者がちょうど1人であることを毎回確かめる。同じ英文を2人が出したときに
 * 作者でない側まで作者として扱われると、ここで2人になって落ちる。
 */
export async function guessOne(pages: Page[], itemIndex: number, itemTotal: number): Promise<void> {
  const label = `${itemIndex + 1} / ${itemTotal}件目`;
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(label, { timeout: 30_000 });
  }

  const authorFlags = await Promise.all(
    pages.map((page) => page.locator("[data-testid='own-submission']").isVisible()),
  );
  expect(authorFlags.filter(Boolean)).toHaveLength(1);

  await Promise.all(
    pages.map(async (page, index) => {
      if (authorFlags[index]) {
        return;
      }
      await page.locator("[data-testid='candidate-list'] button").first().click();
    }),
  );
}

/** 答え合わせが出るのを待つ。締切の12秒で次の件へ自動で進む */
export async function waitJudging(pages: Page[], guessCount: number): Promise<void> {
  await Promise.all(
    pages.map((page) => expect(page.locator("[data-testid='author']")).toBeVisible({ timeout: 20_000 })),
  );
  await expect(pages[0]!.locator("[data-testid='guess-breakdown'] li")).toHaveCount(guessCount);
}

/** 1ラウンドを最後まで進める（提出 → 全件の指名と答え合わせ → 開示） */
export async function playRound(
  pages: Page[],
  textOf: (index: number) => string,
  itemTotal: number,
): Promise<void> {
  await confirmQuestion(pages);
  await submitAll(pages, textOf);
  for (let item = 0; item < itemTotal; item += 1) {
    await guessOne(pages, item, itemTotal);
    await waitJudging(pages, itemTotal - 1);
  }
  for (const page of pages) {
    await expect(page.locator("[data-testid='round-record']").first()).toBeVisible({ timeout: 30_000 });
  }
}
