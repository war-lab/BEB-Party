// 裏画面のペアの指定（ADR-0035、基本設計/02のテスト観点「裏画面」）。
// 裏画面で指定した2人が開始後に同じペアになること、裏画面が参加者に数えられないこと、
// 参加者の端末が受け取ったどのメッセージにもペアの指定が含まれないことを確かめる。
// 8人で4組（上限）を指定する卓と、6人で一部だけ指定し、外す操作も通す卓の2つで通す。
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readMyTeam as readMindMeldTeam, waitForStage as waitForMindMeldStage } from "./support/mindmeld";
import { readMyTeam as readTwoHeadedTeam, waitForStage as waitForTwoHeadedStage } from "./support/twoheaded";
import { clientIpHeaders, gotoWithRetry, openTable } from "./support/room";

/** 受け取った文字列のメッセージをすべて記録する。stateだけでなくsecret・errorも含めて漏れを見るため */
async function recordAllMessages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const received: string[] = [];
    (window as unknown as { __allMessages: string[] }).__allMessages = received;
    const Original = window.WebSocket;
    class Recording extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", (event: MessageEvent) => {
          if (typeof event.data === "string") {
            received.push(event.data);
          }
        });
      }
    }
    window.WebSocket = Recording as unknown as typeof WebSocket;
  });
}

async function readAllMessages(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __allMessages: string[] }).__allMessages ?? []);
}

/** 裏画面を別のコンテキストで開く。参加者のどの端末とも別の端末として扱う */
async function openBackstage(
  browser: Browser,
  baseURL: string,
  code: string,
  testTitle: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(testTitle) });
  const page = await context.newPage();
  await gotoWithRetry(page, `${baseURL}/room/${code}?mode=backstage`);
  await expect(page.locator("[data-testid='backstage-view']")).toBeVisible({ timeout: 30_000 });
  return { page, close: () => context.close() };
}

function tileOf(backstage: Page, name: string) {
  return backstage
    .locator("[data-testid='backstage-player']")
    .filter({ has: backstage.locator(".name", { hasText: new RegExp(`^${name}$`) }) });
}

/** 2人を続けてタップして組にし、サーバから組が届くのを待つ */
async function pin(backstage: Page, a: string, b: string): Promise<void> {
  const before = await backstage.locator("[data-testid='backstage-pair']").count();
  await tileOf(backstage, a).click();
  await tileOf(backstage, b).click();
  await expect(backstage.locator("[data-testid='backstage-pair']")).toHaveCount(before + 1, { timeout: 10_000 });
  await expect(tileOf(backstage, a)).toBeDisabled();
  await expect(tileOf(backstage, b)).toBeDisabled();
}

/** 参加者の端末に、裏画面とペアの指定の痕跡が無いことを確かめる */
async function expectNoLeak(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='backstage-view']")).toHaveCount(0);
    const messages = await readAllMessages(page);
    expect(messages.length).toBeGreaterThan(0);
    for (const raw of messages) {
      expect(raw).not.toContain("pinnedPairs");
    }
  }
}

test("8人で4組を裏画面から指定すると、MIND MELDのチームが指定どおりになり、参加者には漏れない", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const title = test.info().title;
  const table = await openTable(browser, baseURL!, [5, 4, 4, 3, 3, 2, 1, 1], {
    testTitle: title,
    prepare: (page) => recordAllMessages(page),
  });
  const backstage = await openBackstage(browser, baseURL!, table.code, title);

  try {
    const pages = table.pages;
    const host = pages[0]!;
    await expect(backstage.page.locator("[data-testid='backstage-player']")).toHaveCount(8, { timeout: 10_000 });
    await expect(backstage.page.locator("[data-testid='backstage-game-note']")).toContainText("ゲームはまだ選ばれていません");

    // 入室の順で隣り合わない2人を組ませる。レベルの偏りを小さくする自動編成とも一致しない組を含む
    const pairs: [number, number][] = [
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5],
    ];
    for (const [a, b] of pairs) {
      await pin(backstage.page, `Player${a}`, `Player${b}`);
    }
    // 上限の4組に達したら、残りの参加者は選べない（全員が組に入っている）
    await expect(backstage.page.locator("[data-testid='backstage-player']:enabled")).toHaveCount(0);

    // 裏画面は参加者に数えない
    await expect(host.locator(".roster .beb-tile:not(.empty)")).toHaveCount(8);

    await host.click('.title-card:has-text("MIND MELD")');
    await expect(backstage.page.locator("[data-testid='backstage-game-note']")).toContainText(
      "MIND MELD では、指定が使われます",
    );
    await host.click('.content-chip:has-text("はじめてのお題")');
    await host.click(".beb-btn:has-text('ゲームスタート')");

    await waitForMindMeldStage(pages, "遊び方の確認");
    const teams = await Promise.all(pages.map((page) => readMindMeldTeam(page)));
    for (const [a, b] of pairs) {
      expect(teams[a - 1]).toBe(teams[b - 1]);
    }
    expect(new Set(teams).size).toBe(4);

    await expectNoLeak(pages);
  } finally {
    await backstage.close();
    await table.close();
  }
});

test("6人で一部だけ指定し外す操作も通すと、TWO-HEADED SPEAKERで残した組だけが同じペアになる", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const title = test.info().title;
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: title,
    prepare: (page) => recordAllMessages(page),
  });
  const backstage = await openBackstage(browser, baseURL!, table.code, title);

  try {
    const pages = table.pages;
    const host = pages[0]!;
    await expect(backstage.page.locator("[data-testid='backstage-player']")).toHaveCount(6, { timeout: 10_000 });

    // 指定を使わないゲームでは、使われないと出る
    await host.click('.title-card:has-text("BLIND ROOM")');
    await expect(backstage.page.locator("[data-testid='backstage-game-note']")).toContainText(
      "BLIND ROOM では、指定は使われません",
    );

    await pin(backstage.page, "Player1", "Player2");
    await pin(backstage.page, "Player3", "Player6");
    await pin(backstage.page, "Player4", "Player5");
    // 1組目（Player1とPlayer2）を外す。外した2人は再び選べる
    await backstage.page
      .locator("[data-testid='backstage-pair']", { hasText: "Player1 ＆ Player2" })
      .locator("[data-testid='backstage-unpin']")
      .click();
    await expect(backstage.page.locator("[data-testid='backstage-pair']")).toHaveCount(2, { timeout: 10_000 });
    await expect(tileOf(backstage.page, "Player1")).toBeEnabled();

    await host.click('.title-card:has-text("TWO-HEADED SPEAKER")');
    await expect(backstage.page.locator("[data-testid='backstage-game-note']")).toContainText(
      "TWO-HEADED SPEAKER では、指定が使われます",
    );
    await host.click('.content-chip:has-text("Everyday Things")');
    await host.click(".beb-btn:has-text('ゲームスタート')");

    await waitForTwoHeadedStage(pages, "遊び方の確認");
    const teams = await Promise.all(pages.map((page) => readTwoHeadedTeam(page)));
    expect(teams[3 - 1]).toBe(teams[6 - 1]);
    expect(teams[4 - 1]).toBe(teams[5 - 1]);
    // 残りの2人（Player1とPlayer2）は、指定した2組が埋まった後の最後のペアになる
    expect(teams[1 - 1]).toBe(teams[2 - 1]);

    await expectNoLeak(pages);
  } finally {
    await backstage.close();
    await table.close();
  }
});
