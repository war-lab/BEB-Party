// P1 PR-4の通し検証（docs/実装計画/ゲーム構想20案の収録計画.md）
// 受入条件2: 部屋作成からDON'T SAY ITの結果まで通る
// 受入条件3: ゲームを完走したあと nextGame で別のゲームを選べる
//
// ラウンドの締切（既定90秒）を待つとテストが長くなるため、各ラウンドで消費上限まで申告する。
// 上限に達した時点でそのラウンドが終わる仕様（基本設計/09）をそのまま利用し、6ラウンドを回して結果へ到達させる。
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

/**
 * その端末で見えている要素から役を判定する。
 *
 * ステージ遷移の反映を待つため、見つかるまで一定時間だけ繰り返す。
 * どの端末に出るかはサーバが決めた説明者順で決まり、テスト側からは事前に分からない。
 */
async function findPageBy(pages: Page[], selector: string, timeoutMs = 10_000): Promise<Page> {
  const started = Date.now();
  for (;;) {
    for (const page of pages) {
      if (await page.locator(selector).first().isVisible()) {
        return page;
      }
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`該当する端末がない: ${selector}`);
    }
    await pages[0]!.waitForTimeout(200);
  }
}

test("6人で部屋作成からDON'T SAY ITの結果まで進める", async ({ browser, baseURL }) => {
  // 6ラウンド × 上限5枚を回すため、既定の3倍でも足りない
  test.setTimeout(180_000);
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: test.info().title,
    record: true,
  });

  try {
    const host = table.pages[0]!;

    // ロビーの見出しと設定は、選んだゲームが配る記述子で決まる（共通コアはゲーム固有の語を持たない）
    await host.click(`.title-card:has-text("${GAME_TITLE}")`);
    await expect(host.locator("h2:has-text('お題を選ぶ')")).toBeVisible({ timeout: 10_000 });
    await expect(host.locator(".seconds-label")).toHaveText("1ラウンドの秒数");
    await expect(host.locator("h2:has-text('事件を選ぶ')")).toHaveCount(0);

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
    // 監視役は正解も見る（説明者が正解を口に出したときに押せるボタンが必要なため）
    const watcher = await findPageBy(table.pages, "[data-testid='watched-answer']");
    await expect(watcher.locator(".beb-btn:has-text('違反')")).toBeVisible();
    await expect(watcher.locator("[data-testid='answer']")).toHaveCount(0);
    await expect(watcher.locator("[data-testid='watched-answer']")).toContainText(
      (await speaker.locator("[data-testid='answer']").textContent()) ?? "",
    );

    const answerers = table.pages.filter((page) => page !== speaker && page !== watcher);
    expect(answerers).toHaveLength(4);
    for (const page of answerers) {
      await expect(page.locator("text=声を聞いてください")).toBeVisible();
      await expect(page.locator("[data-testid='answer']")).toHaveCount(0);
      await expect(page.locator("[data-testid='watched-answer']")).toHaveCount(0);
      await expect(page.locator(".taboo")).toHaveCount(0);
    }

    // 1ラウンドの消費上限まで申告すると、そのラウンドが自動で終わる。
    // 上限は MAX_CARD_ADVANCES_PER_ROUND（shared/games/dontsayit）と同じ値を使う
    const claimsPerRound = 5;
    const rounds = 6;

    async function claimUpToLimit(page: Page): Promise<void> {
      for (let claimed = 1; claimed <= claimsPerRound; claimed += 1) {
        await page.click(".beb-btn:has-text('正解')");
        await page.locator("[data-testid='claim-sheet'] .beb-btn.blue").first().click();
        if (claimed < claimsPerRound) {
          await expect(page.locator("[data-testid='solved-count']")).toHaveText(`成立 ${claimed}枚`);
        }
      }
    }

    await claimUpToLimit(speaker);

    for (let round = 2; round <= rounds; round += 1) {
      const next = await findPageBy(table.pages, ".beb-btn:has-text('はじめる')");
      await next.click(".beb-btn:has-text('はじめる')");
      await expect(next.locator("[data-testid='answer']")).toBeVisible({ timeout: 10_000 });
      await claimUpToLimit(next);
    }

    // 結果: 全員に届き、使い終えたお題だけが並ぶ
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='stage-timer']:has-text('結果')")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".cards > li")).toHaveCount(claimsPerRound * rounds);
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
