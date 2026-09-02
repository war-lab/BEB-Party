// レビュー指摘の回帰検証（PR #11）。通しの本編（whowrotethis-playthrough.spec.ts）は
// 「最初の1ゲーム」「全員が別の英文」「各人1クリック」しか通らず、次の3経路を通っていなかった。
//
// 1. 同じ部屋で2ゲーム目を遊ぶ（前ゲームの結果が残らないか）
// 2. 2人が同じ英文を提出する（作者の判定がテキスト一致で壊れないか）
// 3. 指名を素早く2回押す（表示した指名先と採点対象が食い違わないか）
//
// 5人卓で回す。開示件数が5件になり、judgingの待ち（12秒×件数）が1ラウンドあたり12秒短くなる。
// 人数は対応範囲（5〜6人）の下限であり、経路の検証には十分である。
import { expect, test } from "@playwright/test";
import { openTable } from "./support/room";
import {
  ROUNDS,
  confirmQuestion,
  guessOne,
  playRound,
  startWhoWroteThis,
  submitAll,
  waitJudging,
} from "./support/whowrotethis";

const PLAYER_COUNT = 5;

// 1つの wrangler dev に複数の卓を同時に張らない。並列で回すと他specまで巻き込んで落ちる（実測）
test.describe.configure({ mode: "serial" });

test("同じ部屋で2ゲーム目を遊んでも前ゲームの結果が残らない", async ({ browser, baseURL }) => {
  // 1ゲーム目もWHO WROTE THIS?にする。別ゲーム（DETECTIVES）を1ゲーム目にすると、
  // そのresultに rounds フィールドが無いため `result?.rounds ?? publicState.rounds` が
  // 偶然フォールバックし、欠陥を検出できない（実測で確認済み）
  test.setTimeout(600_000);
  const table = await openTable(browser, baseURL!, [5, 4, 3, 2, 1], { testTitle: test.info().title });

  try {
    const host = table.pages[0]!;

    // 1ゲーム目を完走してresultを発生させる
    await startWhoWroteThis(host);
    for (let round = 1; round <= ROUNDS; round += 1) {
      await playRound(table.pages, (index) => `Player ${index + 1} wrote this in game one.`, PLAYER_COUNT);
      if (round < ROUNDS) {
        for (const page of table.pages) {
          await page.click("[data-testid='next-round']");
        }
      }
    }
    await expect(host.locator("[data-testid='back-to-lobby']")).toBeVisible({ timeout: 20_000 });
    await expect(host.locator("[data-testid='round-record']")).toHaveCount(ROUNDS);

    // ロビーへ戻して2ゲーム目を始める
    await host.click("[data-testid='back-to-lobby']");
    await expect(host.locator(".title-cards")).toBeVisible({ timeout: 20_000 });
    await startWhoWroteThis(host);

    // 2ゲーム目の1ラウンド目の開示。ここに前ゲームの結果が残っていると、
    // 1ゲーム目の提出と最終得点が出る（resultストアは切断時にしか消えなかった）
    await playRound(table.pages, (index) => `Player ${index + 1} wrote this in game two.`, PLAYER_COUNT);

    for (const page of table.pages) {
      const record = page.locator("[data-testid='round-record']");
      await expect(record).toHaveCount(1);
      await expect(record).toContainText("game two");
      await expect(record).not.toContainText("game one");
      await expect(page.locator("[data-testid='next-round']")).toBeVisible();
      await expect(page.locator("[data-testid='back-to-lobby']")).toHaveCount(0);
    }
  } finally {
    await table.close();
  }
});

test("2人が同じ英文を提出しても作者は1人だけになる", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const table = await openTable(browser, baseURL!, [5, 4, 3, 2, 1], { testTitle: test.info().title });

  try {
    const host = table.pages[0]!;
    await startWhoWroteThis(host);
    await confirmQuestion(table.pages);

    // 全員が完全に同じ英文を出す。提出テキストで作者を判定していると、
    // 開示の1件目で全員が「これはあなたの文です」を見て、指名できる人が誰もいなくなる
    await submitAll(table.pages, () => "I do the same thing every day.");

    // guessOne が「作者はちょうど1人」を毎件で確かめる
    for (let item = 0; item < PLAYER_COUNT; item += 1) {
      await guessOne(table.pages, item, PLAYER_COUNT);
      await waitJudging(table.pages, PLAYER_COUNT - 1);
    }

    // 全件の指名が成立し、開示まで到達する
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='round-record']").first()).toBeVisible({ timeout: 30_000 });
    }
    await expect(host.locator("[data-testid='round-record'] li")).toHaveCount(PLAYER_COUNT);
  } finally {
    await table.close();
  }
});

test("指名を素早く2回押しても、表示と採点対象が食い違わない", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const table = await openTable(browser, baseURL!, [5, 4, 3, 2, 1], { testTitle: test.info().title });

  try {
    const host = table.pages[0]!;
    await startWhoWroteThis(host);
    await confirmQuestion(table.pages);
    await submitAll(table.pages, (index) => `Player ${index + 1} wrote this today.`);

    const label = `1 / ${PLAYER_COUNT}件目`;
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='stage-timer']")).toContainText(label, { timeout: 30_000 });
    }

    // 作者ではないページを1つ選ぶ
    const flags = await Promise.all(
      table.pages.map((page) => page.locator("[data-testid='own-submission']").isVisible()),
    );
    const guesser = table.pages[flags.findIndex((flag) => !flag)]!;

    const buttons = guesser.locator("[data-testid='candidate-list'] button");
    await expect(buttons.first()).toBeVisible({ timeout: 10_000 });
    // ボタンは絵文字と名前を別のspanで持つ。名前だけを取る
    const firstName = (await buttons.first().locator(".name").innerText()).trim();

    // サーバの応答を待たずに2回押す。1回目が採点対象であり、2回目は拒否される
    await buttons.first().click();
    await guesser.locator("[data-testid='candidate-list'] button").nth(1).click({ force: true, timeout: 3000 })
      .catch(() => {
        // 1回目の直後に候補が消える（想定どおり）。押せなければそれで正しい
      });

    // 表示される指名先は1回目のままである
    const picked = guesser.locator("[data-testid='picked']");
    await expect(picked).toBeVisible({ timeout: 10_000 });
    await expect(picked).toContainText(firstName);

    // 残りの人も指名して答え合わせまで進め、内訳が1人1件であることを確かめる
    await Promise.all(
      table.pages.map(async (page, index) => {
        if (flags[index] || page === guesser) {
          return;
        }
        await page.locator("[data-testid='candidate-list'] button").first().click();
      }),
    );
    await waitJudging(table.pages, PLAYER_COUNT - 1);
    await expect(host.locator("[data-testid='guess-breakdown'] li")).toHaveCount(PLAYER_COUNT - 1);
  } finally {
    await table.close();
  }
});
