// ESCAPE CALLの通し検証（基本設計/13_ESCAPECALLゲームモジュール.md のテスト観点）。
// 部屋作成から脱出まで通ること、誤答とヒントが履歴に残ること、錠の中身がstateに載らないことを確かめる。
//
// 各ページの画面に出た断片を集めて、テスト側で答えを組み立てる（support/escapecall.ts）。
import { expect, test } from "@playwright/test";
import { collectPieces, enterCode, solve, waitForLock, wrongCodeFor } from "./support/escapecall";
import { openTable, readStateMessages } from "./support/room";

const GAME_TITLE = "ESCAPE CALL";
const PACK_TITLE = "深夜の研究所";

for (const levels of [
  [2, 4],
  [1, 3, 5],
  [3, 3, 3, 3],
]) {
  test(`${levels.length}人で3つの錠を開けて脱出でき、錠の中身がstateに載らない`, async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const table = await openTable(browser, baseURL!, levels, { record: true, testTitle: test.info().title });

    try {
      const [host, ...others] = table.pages;
      await host!.click(`.title-card:has-text("${GAME_TITLE}")`);
      await host!.click(`.content-chip:has-text("${PACK_TITLE}")`);
      await host!.click(".beb-btn:has-text('ゲームスタート')");

      for (const page of table.pages) {
        await page.click("[data-testid='ready']", { timeout: 30_000 });
      }

      for (let lock = 1; lock <= 3; lock += 1) {
        await waitForLock(table.pages, lock);
        const code = solve(await collectPieces(table.pages));

        if (lock === 1) {
          // 誤答は履歴に残るだけで錠は開かない
          await enterCode(others[0]!, wrongCodeFor(code));
          await expect(host!.locator("[data-testid='attempt']")).toHaveCount(1, { timeout: 10_000 });
          // ヒントはホストだけに出て、押すと1桁目が開く
          await expect(others[0]!.locator("[data-testid='hint']")).toHaveCount(0);
          await host!.click("[data-testid='hint']");
          await expect(others[0]!.locator(".slots li.hinted")).toHaveCount(1, { timeout: 10_000 });
        }

        // 対応表しか持たない人でも入力できる（13のsubmit）
        await enterCode(table.pages[table.pages.length - 1]!, code);
      }

      for (const page of table.pages) {
        await expect(page.locator("[data-testid='outcome']")).toHaveAttribute("data-outcome", "escaped", {
          timeout: 30_000,
        });
      }
      // ヒント1回、誤答1回で脱出したのでA
      await expect(host!.locator("[data-testid='rank']")).toHaveText("RANK A");
      await expect(host!.locator("[data-testid='lock-solution']")).toHaveCount(3);

      // 不変条件2。断片の中身（記号・数字の表・規則の文）はstateのブロードキャストに載らない。
      // 断片の種類名（holders.kinds の "order" 等）は公開する設計であり、検査の対象にしない（13の公開状態）
      const states = (await Promise.all(table.pages.map((page) => readStateMessages(page)))).flat();
      expect(states.length).toBeGreaterThan(0);
      for (const message of states) {
        expect(message).not.toMatch(/(red|blue|yellow|black)_(star|circle|triangle|square)/);
        expect(message).not.toContain('"pieces"');
        expect(message).not.toContain('"rulePhrases"');
        expect(message).not.toMatch(/Skip the|Ignore every|Leave out every|right to left|Swap the first|Add one to/i);
      }
    } finally {
      await table.close();
    }
  });
}
