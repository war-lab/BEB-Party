// M2 PR11の通し検証（docs/実装計画/M2.md）
// 受入条件1: 部屋作成 → 6人参加 → 開始 → ready → 捜査 → 投票 → 開示 が通しで動く
// 受入条件3: 6人のsecretがすべて異なり、他人のカードを含まない
// 受入条件5: 全ステージを通し、stateの受信内容に秘密が含まれない
import { test, expect, type WebSocketRoute } from "@playwright/test";
import { openTable, readStateMessages, readyAll, startGame, voteAll } from "./support/room";

test("6人で部屋作成から開示まで通しで進める", async ({ browser, baseURL }) => {
  test.slow();
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: test.info().title,
    record: true,
  });

  try {
    const host = table.pages[0]!;
    await startGame(host);

    // briefing: 全員に事件概要と配役が届く
    for (const page of table.pages) {
      await expect(page.locator(".case-title")).toBeVisible({ timeout: 10_000 });
    }

    await readyAll(table.pages);

    // investigation: 全員が自分の証言カードと制約を持つ
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='stage-timer']:has-text('捜査フェーズ')")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("[data-testid='constraints']")).toContainText("証言は英語で読み上げる");
      await expect(page.locator("[data-testid='testimony-card']").first()).toBeVisible();
    }

    // 受入条件3: 6人の証言が互いに重複しない（他人のカードが混ざっていない）
    const cardTexts = await Promise.all(
      table.pages.map((page) => page.locator("[data-testid='testimony-card'] .en").allTextContents()),
    );
    const seen = new Set<string>();
    for (const texts of cardTexts) {
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) {
        expect(seen.has(text)).toBe(false);
        seen.add(text);
      }
    }

    // voting: ホストが捜査を切り上げる
    await host.click("text=投票へ進む");
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='stage-timer']:has-text('投票フェーズ')")).toBeVisible({ timeout: 10_000 });
    }

    await voteAll(table.pages);

    // reveal: 全員に結果が届く
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='outcome']")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("[data-testid='outcome']")).toContainText(/市民の勝利|犯人の勝利/);
    }

    // 受入条件5: stateに秘密が含まれない
    for (const page of table.pages) {
      const states = await readStateMessages(page);
      expect(states.length).toBeGreaterThan(0);
      for (const state of states) {
        expect(state).not.toContain("isCulprit");
        expect(state).not.toContain("isLie");
        expect(state).not.toContain("reconnectToken");
        expect(state).not.toContain("targetPlayerId");
        for (const text of seen) {
          expect(state).not.toContain(text);
        }
      }
    }
  } finally {
    await table.close();
  }
});

test("5人での参加時は5人版の事件が使われる", async ({ browser, baseURL }) => {
  test.slow();
  // 6人版のcafe-theftはkitchen_staff(Yuki)をmanager(Ken)へ統合する
  const table = await openTable(browser, baseURL!, [5, 4, 3, 2, 1], { testTitle: test.info().title });

  try {
    const host = table.pages[0]!;
    await startGame(host);
    await expect(host.locator(".case-title")).toBeVisible({ timeout: 10_000 });

    const cast = host.locator(".cast li");
    await expect(cast).toHaveCount(5);
    await expect(host.locator(".cast")).not.toContainText("Yuki");
  } finally {
    await table.close();
  }
});

// 受入条件2: 捜査中にWebSocketを切断し、スナップショットが維持されたまま自動復帰する
test("捜査中に切断してもカードが消えず、自動復帰する", async ({ browser, baseURL }) => {
  test.slow();
  let route: WebSocketRoute | undefined;
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: test.info().title,
    prepare: async (page, index) => {
      if (index !== 1) {
        return;
      }
      await page.routeWebSocket(/\/room\/.*\/ws/, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => server.send(message));
        server.onMessage((message) => ws.send(message));
        route = ws;
      });
    },
  });

  try {
    await startGame(table.pages[0]!);
    await readyAll(table.pages);

    const target = table.pages[1]!;
    await expect(target.locator("[data-testid='stage-timer']:has-text('捜査フェーズ')")).toBeVisible({ timeout: 10_000 });
    const cardCount = await target.locator("[data-testid='testimony-card']").count();
    expect(cardCount).toBeGreaterThan(0);

    route?.close();

    // 切断中もスナップショット（証言カード）が維持される
    await expect(target.locator("text=再接続しています")).toBeVisible({ timeout: 5000 });
    await expect(target.locator("[data-testid='testimony-card']")).toHaveCount(cardCount);

    // 自動復帰し、証言カードが再送される
    await expect(target.locator("text=再接続しています")).not.toBeVisible({ timeout: 20_000 });
    await expect(target.locator("[data-testid='stage-timer']:has-text('捜査フェーズ')")).toBeVisible();
    await expect(target.locator("[data-testid='testimony-card']")).toHaveCount(cardCount);
  } finally {
    await table.close();
  }
});

test("遊び方から収録ゲームのルールを読める", async ({ page, baseURL }) => {
  // 部屋を作らないため、レート制限のためのIP分離は不要
  await page.goto(baseURL!);
  await page.click("text=遊び方");

  const sheet = page.locator("[data-testid='how-to-play']");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("同じ部屋にいる5〜6人で遊ぶ");
  // ゲームごとのルールは動的importで読み込まれる
  await expect(sheet).toContainText("ENGLISH DETECTIVES", { timeout: 10_000 });
  await expect(sheet).toContainText("嘘は1人の証言だけでは割れない");
  await expect(sheet).toContainText("同数で並んだ場合は犯人の勝ち");

  await page.click("text=閉じる");
  await expect(sheet).toHaveCount(0);
});

test("配役カットインはタップするまで役柄をDOMに出さない", async ({ browser, baseURL }) => {
  test.slow();
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], { testTitle: test.info().title });

  try {
    const host = table.pages[0]!;
    await startGame(host);

    await expect(host.locator("[data-testid='role-cover']")).toBeVisible({ timeout: 10_000 });
    // secret受信だけでは役柄の文字列が現れない（基本設計/02）
    await expect(host.locator("[data-testid='role-card']")).toHaveCount(0);
    const beforeTap = await host.content();
    expect(beforeTap).not.toContain("他の人に見せない");

    await host.click("[data-testid='role-cover']");
    await expect(host.locator("[data-testid='role-card']")).toBeVisible();
  } finally {
    await table.close();
  }
});
