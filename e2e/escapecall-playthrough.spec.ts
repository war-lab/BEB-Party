// ESCAPE CALLの通し検証（基本設計/13_ESCAPECALLゲームモジュール.md のテスト観点）。
// 部屋作成から脱出まで通ること、誤答とヒントが履歴に残ること、錠の中身がstateに載らないことを確かめる。
//
// 各ページの画面に出た断片（data属性）を集めて、テスト側で答えを組み立てる。
// 答えの計算はshared/games/escapecallのcomputeCodeと同じ規則をここに写す。
// e2eはワークスペースのパッケージに依存しないため、importせずに持つ（規則を変えたらここも変える）。
import { expect, test, type Page } from "@playwright/test";
import { openTable, readStateMessages } from "./support/room";

const GAME_TITLE = "ESCAPE CALL";
const PACK_TITLE = "深夜の研究所";

interface Collected {
  order: string[];
  front: string[];
  back: string[];
  map: Map<string, string>;
  rules: { ruleId: string; param: string }[];
}

/** 全員の画面から、いま挑戦中の錠の断片を集める */
async function collectPieces(pages: Page[]): Promise<Collected> {
  const collected: Collected = { order: [], front: [], back: [], map: new Map(), rules: [] };
  for (const page of pages) {
    for (const order of await page.locator("[data-testid='piece-order']").all()) {
      const part = await order.getAttribute("data-part");
      const symbols = await order.locator("li[data-symbol]").evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-symbol") ?? ""),
      );
      if (part === "front") collected.front = symbols;
      else if (part === "back") collected.back = symbols;
      else collected.order = symbols;
    }
    const entries = await page
      .locator("[data-testid='piece-map'] li[data-symbol]")
      .evaluateAll((items) => items.map((item) => [item.getAttribute("data-symbol") ?? "", item.getAttribute("data-digit") ?? ""]));
    for (const [symbol, digit] of entries) {
      collected.map.set(symbol!, digit!);
    }
    const rules = await page
      .locator("[data-testid='piece-rule'] li[data-rule-id]")
      .evaluateAll((items) =>
        items.map((item) => ({ ruleId: item.getAttribute("data-rule-id") ?? "", param: item.getAttribute("data-param") ?? "" })),
      );
    collected.rules.push(...rules);
  }
  if (collected.order.length === 0) {
    collected.order = [...collected.front, ...collected.back];
  }
  return collected;
}

/** shared/games/escapecall の computeCode と同じ手順 */
function solve({ order, map, rules }: Collected): string {
  let symbols = [...order];
  for (const rule of rules) {
    if (rule.ruleId === "skip_color") symbols = symbols.filter((symbol) => symbol.split("_")[0] !== rule.param);
    if (rule.ruleId === "skip_shape") symbols = symbols.filter((symbol) => symbol.split("_")[1] !== rule.param);
    if (rule.ruleId === "reverse") symbols = [...symbols].reverse();
  }
  let digits = symbols.map((symbol) => map.get(symbol) ?? "?");
  for (const rule of rules) {
    if (rule.ruleId === "swap_ends" && digits.length > 1) {
      digits = [digits[digits.length - 1]!, ...digits.slice(1, -1), digits[0]!];
    }
    if (rule.ruleId === "add_one") digits = digits.map((digit) => String((Number(digit) + 1) % 10));
  }
  return digits.join("");
}

async function enterCode(page: Page, code: string): Promise<void> {
  for (const digit of code) {
    await page.click(`[data-testid='key-${digit}']`);
  }
  await page.click("[data-testid='submit']");
}

async function waitForLock(pages: Page[], lockNumber: number): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(`解錠 ${lockNumber} / 3`, { timeout: 30_000 });
    await expect(page.locator("[data-testid='my-pieces'] section").first()).toBeVisible({ timeout: 30_000 });
  }
}

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

      const codes: string[] = [];
      for (let lock = 1; lock <= 3; lock += 1) {
        await waitForLock(table.pages, lock);
        const code = solve(await collectPieces(table.pages));
        codes.push(code);

        if (lock === 1) {
          // 誤答は履歴に残るだけで錠は開かない
          const wrong = String((Number(code[0]) + 1) % 10) + code.slice(1);
          await enterCode(others[0]!, wrong);
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
