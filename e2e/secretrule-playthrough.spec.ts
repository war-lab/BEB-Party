// SECRET RULE ENGLISHの通し検証（基本設計/14_SECRETRULEゲームモジュール.md のテスト観点）。
// 部屋作成から結果まで通ること、判定にかからなかった人の画面に成否が出ないこと、印を続けて押しても
// 両方が残ること、成否と秘密の規則がstateに載らないことを確かめる。対応人数の両端（2人と6人）と4人で通す。
//
// 各ページの画面に出た自分の成否を集めて、テスト側で規則を絞る（support/secretrule.ts）。
import { expect, test, type Page } from "@playwright/test";
import { openTable, readStateMessages } from "./support/room";
import {
  BANK,
  PREDICATES,
  collectVerdicts,
  consistentCandidates,
  pickTests,
  readCandidates,
  submitText,
  waitForStage,
} from "./support/secretrule";

const GAME_TITLE = "SECRET RULE ENGLISH";
const PACK_TITLE = "はじめての規則";
const MAX_ROUNDS = 4;

async function clickReady(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.click("[data-testid='ready']");
  }
}

for (const levels of [
  [1, 4],
  [2, 5, 3, 1],
  [1, 2, 3, 4, 5, 3],
]) {
  test(`${levels.length}人で規則を当てて最後の英文まで進み、成否がstateに載らない`, async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const table = await openTable(browser, baseURL!, levels, { record: true, testTitle: test.info().title });

    try {
      const pages = table.pages;
      const host = pages[0]!;
      await host.click(`.title-card:has-text("${GAME_TITLE}")`);
      await host.click(`.content-chip:has-text("${PACK_TITLE}")`);
      await host.click(".beb-btn:has-text('ゲームスタート')");

      await waitForStage(pages, "候補の確認");
      const candidates = await readCandidates(host);
      await clickReady(pages);

      let consistent = [...candidates.keys()];
      const used = new Set<string>();
      let solved = false;

      for (let round = 1; round <= MAX_ROUNDS && !solved; round += 1) {
        await waitForStage(pages, `下書き ${round} / ${MAX_ROUNDS}`);
        const [first, second] = pickTests(consistent, used);
        used.add(first);
        used.add(second);
        await submitText(pages[0]!, first);
        await submitText(pages[1]!, second);
        for (const page of pages.slice(2)) {
          const filler = BANK.find((text) => !used.has(text))!;
          used.add(filler);
          await submitText(page, filler);
        }

        if (pages.length >= 3) {
          // 3件以上の下書きがあると、試す2件を印で選ぶ（14の「判定にかける2件の決め方」）
          await waitForStage(pages, "試す英文を選ぶ");
          for (const page of pages) {
            // 状態が返るのを待たずに続けて押す。先に付けた印が消えないこと（印の連打）
            for (const text of [first, second]) {
              await page.locator("[data-testid='draft']").filter({ hasText: text }).locator("[data-testid='mark-draft']").click();
            }
          }
          for (const page of pages) {
            await expect(page.locator("[data-testid='draft'].marked")).toHaveCount(2, { timeout: 10_000 });
          }
          // サーバの集計でも、試したい2件に全員の印が付いている
          for (const text of [first, second]) {
            await expect(
              host.locator("[data-testid='draft']").filter({ hasText: text }).locator(".markers .face"),
            ).toHaveCount(pages.length, { timeout: 10_000 });
          }
          await clickReady(pages);
        }

        await waitForStage(pages, "報告と回答");
        const verdicts = await collectVerdicts(pages);
        // 試した2件の成否は、それぞれ書いた本人の画面にだけ出る（ADR-0031）
        expect(verdicts.has(first) && verdicts.has(second)).toBe(true);
        await expect(pages[0]!.locator("[data-testid='own-verdict']")).toHaveCount(round);
        // 判定にかからなかった人の画面には、成否が1件も出ない（ADR-0031）
        for (const page of pages.slice(2)) {
          await expect(page.locator("[data-testid='own-verdict']")).toHaveCount(0);
        }
        consistent = consistentCandidates(consistent, verdicts);
        expect(consistent.length).toBeGreaterThan(0);

        if (consistent.length === 1) {
          for (const page of pages) {
            await page
              .locator(`[data-testid='candidate'][data-candidate-id='${consistent[0]}'] [data-testid='select-candidate']`)
              .click();
          }
          await expect(host.locator("[data-testid='answer-status']")).toContainText("揃っています", { timeout: 10_000 });
          solved = true;
        }
        await clickReady(pages);
      }

      expect(solved).toBe(true);
      await waitForStage(pages, "規則を使って書く");
      const rule = consistent[0]!;
      const avoidText = ((await host.locator("[data-testid='proving-target'] .en").nth(1).textContent()) ?? "").trim();
      const avoid = [...candidates].find(([, text]) => text === avoidText)?.[0];
      expect(avoid).toBeDefined();

      // 条件を満たす英文が在庫に無ければ、未使用の任意の英文で出す。通過数はこのテストの対象にしない
      for (const page of pages) {
        const text =
          BANK.find((entry) => !used.has(entry) && PREDICATES[rule]!(entry) && !PREDICATES[avoid!]!(entry)) ??
          BANK.find((entry) => !used.has(entry))!;
        used.add(text);
        await submitText(page, text);
      }

      for (const page of pages) {
        await expect(page.locator("[data-testid='outcome']")).toHaveAttribute("data-outcome", "solved", {
          timeout: 30_000,
        });
      }
      await expect(host.locator("[data-testid='secret-rule']")).toContainText(candidates.get(rule)!);
      await expect(host.locator("[data-testid='rank']")).toHaveText(/RANK [SAB]/);

      // 不変条件2とADR-0031。成否と秘密の規則はstateのブロードキャストに載らない
      const states = (await Promise.all(pages.map((page) => readStateMessages(page)))).flat();
      expect(states.length).toBeGreaterThan(0);
      for (const message of states) {
        expect(message).not.toContain('"passed"');
        expect(message).not.toContain("ruleCandidateId");
        expect(message).not.toContain('"rules"');
        expect(message).not.toContain("currentDrafts");
      }
    } finally {
      await table.close();
    }
  });
}

test("通信が遅くても、印を続けて押すと両方の印が残る", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  // ホストの端末にだけ、サーバからのメッセージを遅らせて届ける。状態が返る前に2つ目の印を押す状況を作る
  const table = await openTable(browser, baseURL!, [3, 3, 3], {
    testTitle: test.info().title,
    prepare: async (page, index) => {
      if (index !== 0) {
        return;
      }
      await page.routeWebSocket(/\/room\/.*\/ws/, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => server.send(message));
        server.onMessage((message) => {
          setTimeout(() => ws.send(message), 600);
        });
      });
    },
  });

  try {
    const pages = table.pages;
    const host = pages[0]!;
    await host.click(`.title-card:has-text("${GAME_TITLE}")`);
    await host.click(`.content-chip:has-text("${PACK_TITLE}")`);
    await host.click(".beb-btn:has-text('ゲームスタート')");
    await waitForStage(pages, "候補の確認");
    await clickReady(pages);
    await waitForStage(pages, `下書き 1 / ${MAX_ROUNDS}`);
    for (const [index, page] of pages.entries()) {
      await submitText(page, BANK[index]!);
    }
    await waitForStage(pages, "試す英文を選ぶ");

    const [first, second] = [BANK[1]!, BANK[2]!];
    for (const text of [first, second]) {
      await host.locator("[data-testid='draft']").filter({ hasText: text }).locator("[data-testid='mark-draft']").click();
    }
    // 遅れて届く状態が両方とも反映された後も、2件に自分の印が残っている
    await host.waitForTimeout(2_000);
    await expect(host.locator("[data-testid='draft'].marked")).toHaveCount(2);
    // サーバの集計（他の端末の表示）でも2件に印が付いている
    for (const text of [first, second]) {
      await expect(
        pages[1]!.locator("[data-testid='draft']").filter({ hasText: text }).locator(".markers .face"),
      ).toHaveCount(1, { timeout: 10_000 });
    }
  } finally {
    await table.close();
  }
});
