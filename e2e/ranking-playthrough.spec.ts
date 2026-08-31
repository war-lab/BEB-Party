// P2 PR-4の通し検証（docs/実装計画/ゲーム構想20案の収録計画.md）
// 部屋作成からENGLISH RANKINGの結果まで通ることと、目標がstateに載らないことを確かめる。
//
// 議論ステージ（既定120秒）の締切を待つとテストが長くなるため、議論はホストの操作で待たずに
// 締切前提の経路は使わない。議論から順位の確定へは締切でしか進まないため、
// ロビーで議論を最短の60秒に設定して進める。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { openTable, readStateMessages } from "./support/room";

const GAME_TITLE = "ENGLISH RANKING";
const PACK_TITLE = "価値観";
const ROUNDS = 3;

/** 収録セットの目標文。公開状態に現れてよいのは確定済みのラウンドの中だけである */
const GOAL_TEXTS: string[] = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../content/ranking/values.json", import.meta.url)), "utf8"),
  ) as { sets: { goals: { ja: string }[] }[] }
).sets.flatMap((set) => set.goals.map((goal) => goal.ja));

/** ホストがENGLISH RANKINGとお題パックを選び、議論を最短にして開始する */
async function startRanking(host: Page, discussionSeconds = 60): Promise<void> {
  await host.click(`.title-card:has-text("${GAME_TITLE}")`);
  await host.click(`.content-chip:has-text("${PACK_TITLE}")`);
  await host.fill("label.seconds input[type='number']", String(discussionSeconds));
  // onchangeで送るため、focusを外して確定させる
  await host.locator("label.seconds input[type='number']").blur();
  await host.click(".beb-btn:has-text('ゲームスタート')");
}

/** 全員が目標のカットインを開いて「かくにんした」を送る */
async function confirmGoals(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.waitForSelector("[data-testid='goal-cover']", { timeout: 20_000 });
    await page.click("[data-testid='goal-cover']");
    await expect(page.locator("[data-testid='goal-card']")).toBeVisible({ timeout: 10_000 });
    await page.click("[data-testid='goal-confirm']");
  }
}

/** ホストが順位を1つ入れ替えて提案し、全員が承認する */
async function proposeAndApprove(pages: Page[]): Promise<void> {
  const host = pages[0]!;
  // 議論は締切でしか終わらない。ロビーで60秒に設定しているため、それより長く待つ
  await host.waitForSelector("[data-testid='ranking-editor']", { timeout: 90_000 });

  // 既定の並び（項目の定義順）をそのまま出さない。並べ替えの操作そのものを通す
  await expect(host.locator("[data-testid='ranking-editor'] li")).toHaveCount(5);
  await host.locator("[data-testid='ranking-editor'] li").nth(1).locator("button").first().click();
  await host.click("[data-testid='propose']");

  for (const page of pages) {
    await expect(page.locator("[data-testid='proposal']")).toBeVisible({ timeout: 10_000 });
    await page.click("[data-testid='approve']");
  }
}

test("6人で部屋作成からENGLISH RANKINGの結果まで進める", async ({ browser, baseURL }) => {
  // 3ラウンド × 議論60秒の締切待ちがあるため、既定の3倍でも足りない
  test.setTimeout(240_000);
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: test.info().title,
    record: true,
  });

  try {
    const host = table.pages[0]!;
    await startRanking(host);

    for (let round = 1; round <= ROUNDS; round += 1) {
      // 目標の確認: 伏せ面 → タップ → 溜め → 目標 の順に出る
      await confirmGoals(table.pages);

      // 議論: 操作は無い。締切でサーバが順位の確定へ進める
      for (const page of table.pages) {
        await expect(page.locator("[data-testid='my-goal']")).toBeVisible({ timeout: 20_000 });
      }

      // 順位の確定: ホストが提案し、全員が承認する
      await proposeAndApprove(table.pages);

      // 開示: 確定順位と全員の目標が出る
      for (const page of table.pages) {
        await expect(page.locator("[data-testid='final-ranking']")).toBeVisible({ timeout: 15_000 });
        await expect(page.locator("[data-testid='revealed-goals'] li")).toHaveCount(6);
      }

      if (round < ROUNDS) {
        for (const page of table.pages) {
          await page.click("[data-testid='next-round']");
        }
      }
    }

    // 最終ラウンドの確定で結果になる。ロビーへ戻る導線が出る
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='back-to-lobby']")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("[data-testid='score-board'] li")).toHaveCount(6);
    }

    // 受入条件: 進行中のラウンドの目標がstateに載らない（ADR-0003）。
    //
    // 確定したラウンドの目標は rounds[] として公開される仕様であるため、
    // 「文字列としてどこにも現れない」では検査にならない。rounds[] を除いた公開状態に
    // 収録セットのどの目標文も現れないことを見る。
    for (const page of table.pages) {
      const states = await readStateMessages(page);
      expect(states.length).toBeGreaterThan(0);

      for (const state of states) {
        // 言い回しの例は秘密情報にしか入らない。公開状態には一度も現れない
        expect(state).not.toContain("hintEn");
        expect(state).not.toContain("reconnectToken");

        const gameState = (JSON.parse(state) as { gameState?: Record<string, unknown> }).gameState;
        if (gameState === undefined) {
          continue;
        }
        const withoutRounds = JSON.stringify({ ...gameState, rounds: [] });
        for (const goalText of GOAL_TEXTS) {
          expect(withoutRounds).not.toContain(goalText);
        }
      }

      // 確定済みのラウンド数が roundIndex と一致する（先のラウンドの目標が漏れていない）
      const duringDiscussion = states
        .map((state) => JSON.parse(state) as { stage?: string; gameState?: { roundIndex: number; rounds: unknown[] } })
        .filter((parsed) => parsed.stage === "discussion" && parsed.gameState !== undefined);
      expect(duringDiscussion.length).toBeGreaterThan(0);
      for (const parsed of duringDiscussion) {
        expect(parsed.gameState!.rounds).toHaveLength(parsed.gameState!.roundIndex);
      }
    }
  } finally {
    await table.close();
  }
});

test("遊び方からENGLISH RANKINGのルールを読める", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const table = await openTable(browser, baseURL!, [3, 3, 3, 3, 3, 3], { testTitle: test.info().title });

  try {
    const host = table.pages[0]!;
    // ゲーム選択のカードの横にある「遊び方」から、そのゲームのルールだけが開く
    await host.getByRole("button", { name: `${GAME_TITLE}の遊び方` }).click();

    const sheet = host.locator("[data-testid='how-to-play']");
    await expect(sheet).toBeVisible();
    // ゲームごとのルールは動的importで読み込まれる
    await expect(sheet).toContainText(GAME_TITLE, { timeout: 10_000 });
    await expect(sheet).toContainText("秘密の目標");
    await expect(sheet).toContainText("順位の確定");
    // プレイ中でなくても、他ゲームの説明は混ざらない
    await expect(sheet).not.toContainText("禁止語");
  } finally {
    await table.close();
  }
});
