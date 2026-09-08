// 4ゲームの全ステージの素材を撮る。
//
// 実アプリを実際にプレイして撮る（モックを描かない）。素材は movies/assets/shots/ へ出す。
// 各ゲームを1テストにするのは、途中で失敗しても他のゲームの素材が残るようにするためである。
//
// 卓を立てるところは検証用のE2Eヘルパー（e2e/support/room.ts）を再利用する。
// 「5〜6人で入室してロビーに並ぶ」は撮影でも検証でも同じ手順であり、二重に持つ理由がない。
import { expect, test } from "@playwright/test";
import { openTable, startGame, voteAll } from "../../e2e/support/room";
import { confirmGoalsTolerant, findPageBy, readyAllTolerant, shoot, startWith } from "./support";

const LEVELS = [3, 1, 2, 4, 5, 5];

/**
 * WHO WROTE THIS? の提出文。
 *
 * 本人の名前を入れない。名前を入れると読んだ時点で作者が分かり、
 * 作者当てを見せる映像として成立しない（実測で `Player 5 would ...` を撮ってしまった）。
 * 文体（長さ・句読点・語彙）だけで差が付くようにする。文体で当てるのがこのゲームである。
 * どの質問が抽選されても答えとして読める書き方にしてある（質問はseedで決まり、指定できない）。
 */
const SUBMISSIONS = [
  // どれも MIN_WORDS（4語）以上にする。3語の文を混ぜると送信ボタンが無効のまま待ち続ける（実測）
  "I would sleep until noon, honestly.",
  "Just coffee, and nothing else.",
  "Something warm and very quiet.",
  "I have no idea about that.",
  "A small dog would fix everything.",
  "Anything with a lot of cheese.",
];

test("共通画面（ホーム・ロビー）", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, LEVELS, { testTitle: "common" });
  try {
    const host = table.pages[0]!;
    // ロビー: 参加者グリッドとゲーム選択カード4枚
    await shoot(host, "common-lobby");
    // 参加者側のロビー（ゲーム選択が出ない）
    await shoot(table.pages[1]!, "common-lobby-guest");
  } finally {
    await table.close();
  }
});

test("ホーム画面", async ({ browser, baseURL }) => {
  // 部屋に入る前の画面なので、卓を立てずに単独で撮る
  const context = await browser.newContext();
  const home = await context.newPage();
  try {
    await home.goto(baseURL!);
    // type属性を持たないinputのため属性セレクタでは当たらない。アクセシブル名で引く
    await home.getByRole("textbox", { name: "なまえ" }).fill("Ken");
    await shoot(home, "common-home");
  } finally {
    await context.close();
  }
});

test("ENGLISH DETECTIVES", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, LEVELS, { testTitle: "detectives" });
  try {
    const host = table.pages[0]!;
    await startGame(host);

    // 配役カットインが全画面に出るため、先にそれを撮る。
    // 閉じる前にブリーフィングを撮ると伏せ面しか写らない（実測）
    await expect(host.locator("[data-testid='role-cover']")).toBeVisible({ timeout: 20_000 });
    await shoot(host, "detectives-role-cover");
    await host.click("[data-testid='role-cover']");
    await shoot(host, "detectives-role-card");
    await host.click(".beb-btn:has-text('確認した')");

    // briefing: 事件の概要（全員に同じ）。伏せ面を閉じてから撮る
    await expect(host.locator(".case-title")).toBeVisible({ timeout: 20_000 });
    await shoot(host, "detectives-briefing");

    await readyAllTolerant(table.pages, "role-cover");

    // investigation: 証言カードと制約
    await expect(host.locator("[data-testid='stage-timer']:has-text('捜査フェーズ')")).toBeVisible({
      timeout: 20_000,
    });
    await shoot(host, "detectives-investigation");
    // レベル1〜2には質問テンプレートが付く。レベル差の吸収を見せる素材にする
    await shoot(table.pages[1]!, "detectives-investigation-level1");

    await host.click(".beb-btn:has-text('投票へ進む')");
    // voting: 容疑者グリッド
    await expect(host.locator("[data-testid='stage-timer']:has-text('投票フェーズ')")).toBeVisible({
      timeout: 20_000,
    });
    await shoot(host, "detectives-voting");
    await voteAll(table.pages);

    // reveal: 犯人の開示
    await expect(host.locator("[data-testid='outcome']")).toBeVisible({ timeout: 20_000 });
    await shoot(host, "detectives-reveal");
  } finally {
    await table.close();
  }
});

test("DON'T SAY IT", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, LEVELS, { testTitle: "dontsayit" });
  try {
    const host = table.pages[0]!;
    await startWith(host, "DON'T SAY IT", "Famous Figures");

    // briefing: 3役と説明の順番
    await expect(host.locator(".roles")).toBeVisible({ timeout: 20_000 });
    await shoot(host, "dontsayit-briefing");
    for (const page of table.pages) {
      await page.click(".beb-btn:has-text('準備できた')");
    }

    // handoff: 説明者だけが伏せ面 → お題
    const speaker = await findPageBy(table.pages, "[data-testid='speaker-cover']");
    await shoot(speaker, "dontsayit-handoff-cover");
    await speaker.click("[data-testid='speaker-cover']");
    await shoot(speaker, "dontsayit-handoff-card");
    await speaker.click(".beb-btn:has-text('はじめる')");

    // explaining: 3役で画面が別物になる。3枚とも撮る
    await expect(speaker.locator("[data-testid='answer']")).toBeVisible({ timeout: 20_000 });
    await shoot(speaker, "dontsayit-explaining-speaker");
    const watcher = await findPageBy(table.pages, "[data-testid='watched-answer']");
    await shoot(watcher, "dontsayit-explaining-watcher");
    const answerer = table.pages.find((page) => page !== speaker && page !== watcher)!;
    await shoot(answerer, "dontsayit-explaining-answerer");

    // 正解の申告は2段階。ボトムシートを撮る
    await speaker.click(".beb-btn:has-text('正解')");
    await shoot(speaker, "dontsayit-claim-sheet");
    await speaker.locator("[data-testid='claim-sheet'] .beb-btn.blue").first().click();
    await shoot(speaker, "dontsayit-explaining-solved");
  } finally {
    await table.close();
  }
});

test("ENGLISH RANKING", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, LEVELS, { testTitle: "ranking" });
  try {
    const host = table.pages[0]!;
    await startWith(host, "ENGLISH RANKING", "価値観", 60);

    // briefing: 目標の伏せ面 → 目標カード（DETECTIVESと同じく伏せ面が全画面に出る）
    await expect(host.locator("[data-testid='goal-cover']")).toBeVisible({ timeout: 20_000 });
    await shoot(host, "ranking-goal-cover");
    await host.click("[data-testid='goal-cover']");
    await expect(host.locator("[data-testid='goal-card']")).toBeVisible({ timeout: 15_000 });
    await shoot(host, "ranking-goal-card");
    await host.click("[data-testid='goal-confirm']");

    // 5項目が並ぶブリーフィング本体は、伏せ面を閉じてから撮る
    await expect(host.locator("[data-testid='item-list']")).toBeVisible({ timeout: 15_000 });
    await shoot(host, "ranking-briefing");

    await confirmGoalsTolerant(table.pages);

    // discussion: 自分の目標と5項目と言い回し
    await expect(host.locator("[data-testid='my-goal']")).toBeVisible({ timeout: 30_000 });
    await shoot(host, "ranking-discussion");

    // confirming: ホストが順位を並べ、参加者が承認する
    await expect(host.locator("[data-testid='ranking-editor']")).toBeVisible({ timeout: 90_000 });
    await shoot(host, "ranking-confirming");
    await host.locator("[data-testid='ranking-editor'] li").nth(1).locator("button").first().click();
    await host.click("[data-testid='propose']");
    await shoot(table.pages[1]!, "ranking-approve");
    for (const page of table.pages) {
      const approve = page.locator("[data-testid='approve']");
      await approve.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
      await approve.click().catch(() => undefined);
    }

    // reveal: 確定順位と全員の目標
    await expect(host.locator("[data-testid='final-ranking']")).toBeVisible({ timeout: 30_000 });
    await shoot(host, "ranking-reveal");
  } finally {
    await table.close();
  }
});

test("WHO WROTE THIS?", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, LEVELS, { testTitle: "whowrotethis" });
  try {
    const host = table.pages[0]!;
    await startWith(host, "WHO WROTE THIS?", "日常", 150);

    // briefing: 質問と、自分に配られた言い方の例
    await expect(host.locator("[data-testid='ready']")).toBeVisible({ timeout: 20_000 });
    await shoot(host, "whowrotethis-briefing");
    // レベル1の端末は例が3件。レベル差の吸収を見せる素材にする
    await shoot(table.pages[1]!, "whowrotethis-briefing-level1");
    for (const page of table.pages) {
      await page.click("[data-testid='ready']");
    }

    // writing: 入力欄。空・4語未満・書けた状態の3枚
    const input = host.locator("[data-testid='submission-input']");
    await expect(input).toBeVisible({ timeout: 20_000 });
    await shoot(host, "whowrotethis-writing-empty");
    await input.fill("I want to");
    await shoot(host, "whowrotethis-writing-tooshort");
    await input.fill("I want to stop the rain for one minute.");
    await shoot(host, "whowrotethis-writing-ready");

    for (const [index, page] of table.pages.entries()) {
      await page.locator("[data-testid='submission-input']").fill(SUBMISSIONS[index % SUBMISSIONS.length]!);
      await page.click("[data-testid='submit']");
    }

    // guessing: 開示された1件と候補。作者側の画面も撮る
    await expect(host.locator("[data-testid='presented-text']")).toBeVisible({ timeout: 30_000 });
    const author = await findPageBy(table.pages, "[data-testid='own-submission']");
    await shoot(author, "whowrotethis-guessing-author");
    const guesser = table.pages.find((page) => page !== author)!;
    await shoot(guesser, "whowrotethis-guessing");

    for (const page of table.pages) {
      if (page === author) {
        continue;
      }
      await page.locator("[data-testid='candidate-list'] button").first().click();
    }

    // judging: 作者と指名の内訳
    await expect(host.locator("[data-testid='author']")).toBeVisible({ timeout: 30_000 });
    await shoot(host, "whowrotethis-judging");
  } finally {
    await table.close();
  }
});
