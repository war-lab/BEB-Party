// ロビーのゲーム一覧に、遊び方の形のタグが出ること（基本設計/02の「ゲーム一覧の並びと淡色化」、05の「遊び方の形のタグ」）。
// タグがカタログから画面まで届かないこと、形と性質の並びが崩れることを検出する
import { expect, test } from "@playwright/test";
import { openTable } from "./support/room";

const EXPECTED: [string, string[]][] = [
  ["ENGLISH DETECTIVES", ["陣営戦", "正体隠匿"]],
  ["DON'T SAY IT", ["個人戦"]],
  ["ENGLISH RANKING", ["個人戦"]],
  ["WHO WROTE THIS?", ["個人戦"]],
  ["BLIND ROOM", ["個人戦"]],
  ["ESCAPE CALL", ["協力"]],
  ["SECRET RULE ENGLISH", ["協力"]],
  ["MIND MELD", ["チーム戦"]],
  ["TWO-HEADED SPEAKER", ["チーム戦"]],
  ["SECRET TEAMS", ["チーム戦", "正体隠匿"]],
];

test("ゲーム一覧の各カードに遊び方の形のタグが、形→性質の順で出る", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, [3], { testTitle: test.info().title });

  try {
    const host = table.pages[0]!;
    await expect(host.locator(".title-card")).toHaveCount(EXPECTED.length, { timeout: 10_000 });
    for (const [title, tags] of EXPECTED) {
      const card = host.locator(".title-card").filter({
        has: host.locator(".title-card-name", { hasText: new RegExp(`^${title.replace(/[?]/g, "\\?")}$`) }),
      });
      await expect(card.locator("[data-testid='game-tag']"), title).toHaveText(tags);
    }
  } finally {
    await table.close();
  }
});
