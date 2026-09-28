// ESCAPE CALLの卓で、画面に出た断片から答えを組み立てる補助（E2Eとムービー撮影で共用する）。
//
// 各ページの断片（data属性）を集めて答えを計算する。答えの計算は
// shared/games/escapecall の computeCode と同じ規則をここに写す。
// e2eはワークスペースのパッケージに依存しないため、importせずに持つ（規則を変えたらここも変える）。
import { expect, type Page } from "@playwright/test";

export interface CollectedPieces {
  order: string[];
  map: Map<string, string>;
  rules: { ruleId: string; param: string }[];
}

/** 全員の画面から、いま挑戦中の錠の断片を集める */
export async function collectPieces(pages: Page[]): Promise<CollectedPieces> {
  let whole: string[] = [];
  let front: string[] = [];
  let back: string[] = [];
  const map = new Map<string, string>();
  const rules: { ruleId: string; param: string }[] = [];
  for (const page of pages) {
    for (const order of await page.locator("[data-testid='piece-order']").all()) {
      const part = await order.getAttribute("data-part");
      const symbols = await order
        .locator("li[data-symbol]")
        .evaluateAll((items) => items.map((item) => item.getAttribute("data-symbol") ?? ""));
      if (part === "front") front = symbols;
      else if (part === "back") back = symbols;
      else whole = symbols;
    }
    const entries = await page
      .locator("[data-testid='piece-map'] li[data-symbol]")
      .evaluateAll((items) =>
        items.map((item) => [item.getAttribute("data-symbol") ?? "", item.getAttribute("data-digit") ?? ""]),
      );
    for (const [symbol, digit] of entries) {
      map.set(symbol!, digit!);
    }
    rules.push(
      ...(await page
        .locator("[data-testid='piece-rule'] li[data-rule-id]")
        .evaluateAll((items) =>
          items.map((item) => ({
            ruleId: item.getAttribute("data-rule-id") ?? "",
            param: item.getAttribute("data-param") ?? "",
          })),
        )),
    );
  }
  return { order: whole.length > 0 ? whole : [...front, ...back], map, rules };
}

/** shared/games/escapecall の computeCode と同じ手順 */
export function solve({ order, map, rules }: CollectedPieces): string {
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

/** 10キーで答えを打つ。submit を押すかどうかは呼び出し側が決める */
export async function typeCode(page: Page, code: string): Promise<void> {
  for (const digit of code) {
    await page.click(`[data-testid='key-${digit}']`);
  }
}

export async function enterCode(page: Page, code: string): Promise<void> {
  await typeCode(page, code);
  await page.click("[data-testid='submit']");
}

/** 全員の画面が、その錠（1始まり）の断片を表示するまで待つ */
export async function waitForLock(pages: Page[], lockNumber: number): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(`解錠 ${lockNumber} / 3`, {
      timeout: 30_000,
    });
    await expect(page.locator("[data-testid='my-pieces'] section").first()).toBeVisible({ timeout: 30_000 });
  }
}

/** 前の錠と桁数が同じで、答えと違う数字列。誤答の見本に使う */
export function wrongCodeFor(code: string): string {
  return String((Number(code[0]) + 1) % 10) + code.slice(1);
}
