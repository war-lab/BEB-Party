// P1 PR-4の通し検証（docs/実装計画/ゲーム構想20案の収録計画.md）
// 受入条件2: 部屋作成からDON'T SAY ITの結果まで通る
// 受入条件3: ゲームを完走したあと nextGame で別のゲームを選べる
//
// ラウンドの締切（既定90秒）を待つとテストが長くなるため、山札を使い切って結果へ到達させる。
// 山札が尽きた時点でゲームが終わる仕様（基本設計/09）をそのまま利用する。
import { expect, test, type Page } from "@playwright/test";
import { openTable, readStateMessages, readyAll, startGame, voteAll } from "./support/room";

const GAME_TITLE = "DON'T SAY IT";
const SET_TITLE = "Famous Figures";

/** ホストがDON'T SAY ITとお題セットを選び、開始する */
async function startDontSayIt(host: Page): Promise<void> {
  await host.click(`.title-card:has-text("${GAME_TITLE}")`);
  await host.click(`.content-chip:has-text("${SET_TITLE}")`);
  await host.click(".beb-btn:has-text('ゲームスタート')");
}

/** その端末で見えている要素から役を判定する */
async function findPageBy(pages: Page[], selector: string): Promise<Page> {
  for (const page of pages) {
    if (await page.locator(selector).first().isVisible()) {
      return page;
    }
  }
  throw new Error(`該当する端末がない: ${selector}`);
}

test("6人で部屋作成からDON'T SAY ITの結果まで進める", async ({ browser, baseURL }) => {
  // 32枚を流量制限内のペースで消費するため、既定の3倍でも足りない
  test.setTimeout(180_000);
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: test.info().title,
    record: true,
  });

  try {
    const host = table.pages[0]!;
    await startDontSayIt(host);

    // ルール確認: 全員に3役と説明の順番が届く
    for (const page of table.pages) {
      await expect(page.locator(".roles")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".order li")).toHaveCount(6);
      await expect(page.locator("[data-testid='score-board'] li")).toHaveCount(6);
    }

    for (const page of table.pages) {
      await page.click(".beb-btn:has-text('準備できた')");
      await expect(
        page
          .locator(".beb-btn:has-text('他の人を待っています'), [data-testid='stage-timer']:has-text('交代')")
          .first(),
      ).toBeVisible({ timeout: 10_000 });
    }

    // 交代: 説明者の端末にだけ開始ボタンが出る。締切の数字は出さない
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='stage-timer']:has-text('交代')")).toBeVisible({ timeout: 10_000 });
    }
    const speaker = await findPageBy(table.pages, ".beb-btn:has-text('はじめる')");
    const startButtons = await Promise.all(
      table.pages.map((page) => page.locator(".beb-btn:has-text('はじめる')").isVisible()),
    );
    expect(startButtons.filter((visible) => visible)).toHaveLength(1);

    await speaker.click(".beb-btn:has-text('はじめる')");

    // 説明タイム: 3役で画面の中身が変わる
    await expect(speaker.locator("[data-testid='answer']")).toBeVisible({ timeout: 10_000 });
    const watcher = await findPageBy(table.pages, "text=お題は見えません");
    await expect(watcher.locator(".beb-btn:has-text('違反')")).toBeVisible();
    await expect(watcher.locator("[data-testid='answer']")).toHaveCount(0);

    const answerers = table.pages.filter((page) => page !== speaker && page !== watcher);
    expect(answerers).toHaveLength(4);
    for (const page of answerers) {
      await expect(page.locator("text=声を聞いてください")).toBeVisible();
      await expect(page.locator("[data-testid='answer']")).toHaveCount(0);
      await expect(page.locator(".taboo")).toHaveCount(0);
    }

    // 山札32枚を使い切る。1枚ごとに成立枚数の増加を待つ。
    // 待たずに次を押すと、画面に残った前のカードのidで申告してstale_cardで弾かれる。
    //
    // 申告の間隔を空けるのは、ソケットごとの流量制限が20通/10秒であるため（ADR-0017）。
    // 実プレイでは1枚の説明に数秒以上かかるため到達しないが、テストは人手より速く押せる。
    const deckSize = 32;
    const claimIntervalMs = 600;
    for (let claimed = 1; claimed <= deckSize; claimed += 1) {
      await speaker.click(".beb-btn:has-text('正解')");
      await speaker.locator("[data-testid='claim-sheet'] .beb-btn.blue").first().click();
      if (claimed < deckSize) {
        await expect(speaker.locator("[data-testid='solved-count']")).toHaveText(`成立 ${claimed}枚`);
        await speaker.waitForTimeout(claimIntervalMs);
      }
    }

    // 結果: 全員に届き、使い終えたお題だけが並ぶ
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='stage-timer']:has-text('結果')")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".cards > li")).toHaveCount(32);
      await expect(page.locator(".expressions li").first()).toBeVisible();
    }

    // 受入条件: stateに人物名と禁止語が含まれない
    for (const page of table.pages) {
      const states = await readStateMessages(page);
      expect(states.length).toBeGreaterThan(0);
      for (const state of states) {
        expect(state).not.toContain("Doraemon");
        expect(state).not.toContain("Pikachu");
        expect(state).not.toContain("moonwalk");
        expect(state).not.toContain("answer");
        expect(state).not.toContain("taboo");
        expect(state).not.toContain("reconnectToken");
      }
    }
  } finally {
    await table.close();
  }
});

test("DETECTIVESを完走したあとロビーへ戻ってDON'T SAY ITを始められる", async ({ browser, baseURL }) => {
  // 1テストで2ゲーム分の導線を通すため、slow()の3倍でも足りない
  test.setTimeout(240_000);
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], { testTitle: test.info().title });

  try {
    const host = table.pages[0]!;
    await startGame(host);
    await expect(host.locator(".case-title")).toBeVisible({ timeout: 10_000 });
    await readyAll(table.pages);
    await host.click(".beb-btn:has-text('投票へ進む')");
    await voteAll(table.pages);
    await expect(host.locator("[data-testid='outcome']")).toBeVisible({ timeout: 10_000 });

    // nextGameでロビーへ戻る。持ち越すのは参加者とレベルだけ（ADR-0011）
    // 開示は verdict → lie → contradictions → review の4段で、最後の段にだけロビーへ戻る操作が出る
    for (let step = 0; step < 3; step += 1) {
      await host.click(".beb-btn:has-text('つづき')");
    }
    await host.click(".beb-btn:has-text('ロビーへ戻る')");
    // ゲーム選択はホストにだけ出る。参加者側はロビーの参加者一覧で戻ったことを確かめる
    await expect(host.locator(".title-cards")).toBeVisible({ timeout: 10_000 });
    for (const page of table.pages) {
      await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(6, { timeout: 10_000 });
    }

    await startDontSayIt(host);
    for (const page of table.pages) {
      await expect(page.locator(".roles")).toBeVisible({ timeout: 10_000 });
    }
  } finally {
    await table.close();
  }
});
