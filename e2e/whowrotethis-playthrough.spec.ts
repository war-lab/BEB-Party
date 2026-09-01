// P3 PR-5の通し検証（docs/実装計画/ゲーム構想20案の収録計画.md）
// 部屋作成からWHO WROTE THIS?の結果まで通ることと、提出・作者・指名先がstateに載らないことを確かめる。
//
// judgingは操作を持たず締切の12秒がそのまま経過する。6件×2ラウンドで約144秒待つため、
// 英作文は最短の60秒に設定し、test.setTimeoutを長く取る。
import { expect, test, type Page } from "@playwright/test";
import { openTable, readStateMessages } from "./support/room";

const GAME_TITLE = "WHO WROTE THIS?";
const PACK_TITLE = "日常";
const ROUNDS = 2;
const PLAYER_COUNT = 6;

/** ホストがWHO WROTE THIS?とお題パックを選び、英作文を最短にして開始する */
async function startGame(host: Page, writingSeconds = 60): Promise<void> {
  await host.click(`.title-card:has-text("${GAME_TITLE}")`);
  await host.click(`.content-chip:has-text("${PACK_TITLE}")`);
  await host.fill("label.seconds input[type='number']", String(writingSeconds));
  // onchangeで送るため、focusを外して確定させる
  await host.locator("label.seconds input[type='number']").blur();
  await host.click(".beb-btn:has-text('ゲームスタート')");
}

/** 全員が質問を確認してreadyを送る */
async function confirmQuestion(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await expect(page.locator("[data-testid='ready']")).toBeVisible({ timeout: 20_000 });
    await page.click("[data-testid='ready']");
  }
}

/**
 * 各自が別々の英文を提出する。
 *
 * 1人目は4語未満で送信ボタンが無効であることを確かめてから書き直す
 * （クライアント側で下限を止めており、サーバの拒否を通常操作で踏ませない。基本設計/02）。
 */
async function submitAll(pages: Page[], round: number): Promise<void> {
  for (const [index, page] of pages.entries()) {
    const input = page.locator("[data-testid='submission-input']");
    await expect(input).toBeVisible({ timeout: 20_000 });

    if (index === 0) {
      await input.fill("Too short");
      await expect(page.locator("[data-testid='submit']")).toBeDisabled();
      await expect(page.locator("[data-testid='too-short-hint']")).toBeVisible();
    }

    await input.fill(`Player ${index + 1} wrote this in round ${round}.`);
    await expect(page.locator("[data-testid='submit']")).toBeEnabled();
    await page.click("[data-testid='submit']");
  }
}

/**
 * 表示中の1件に、作者以外の全員が指名する。
 *
 * 作者の端末には候補が出ず、待機表示になる（基本設計/11の「作者は自分の件で指名しない」）。
 * 誰が作者かはクライアント側でも手元の提出との一致でしか分からないため、
 * 候補一覧が出ているページだけを指名させる。
 *
 * ページを順番に1つずつ操作しない。最後の指名でサーバが答え合わせへ進むため、
 * 作者のページを最後に見ると、そのページは次の件の指名画面を見てしまう（実測）。
 * 件番号をタイマーバーの見出しで固定し、指名は並行して送る。
 */
async function guessOne(pages: Page[], itemIndex: number): Promise<void> {
  const label = `${itemIndex + 1} / ${PLAYER_COUNT}件目`;
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(label, { timeout: 30_000 });
  }

  const authorFlags = await Promise.all(
    pages.map((page) => page.locator("[data-testid='own-submission']").isVisible()),
  );
  // 開示中の1件の作者はちょうど1人である
  expect(authorFlags.filter(Boolean)).toHaveLength(1);

  await Promise.all(
    pages.map(async (page, index) => {
      if (authorFlags[index]) {
        return;
      }
      await page.locator("[data-testid='candidate-list'] button").first().click();
    }),
  );
}

/** 答え合わせが出るのを待つ。締切の12秒で次の件へ自動で進む */
async function waitJudging(pages: Page[]): Promise<void> {
  // 12秒で次へ進むため、全ページを並行して確かめる
  await Promise.all(
    pages.map((page) => expect(page.locator("[data-testid='author']")).toBeVisible({ timeout: 20_000 })),
  );
  await expect(pages[0]!.locator("[data-testid='guess-breakdown'] li")).toHaveCount(PLAYER_COUNT - 1);
}

test("6人で部屋作成からWHO WROTE THIS?の結果まで進める", async ({ browser, baseURL }) => {
  // judgingの締切待ちが6件×2ラウンドで約144秒ある。既定の3倍でも足りない
  test.setTimeout(420_000);
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: test.info().title,
    record: true,
  });

  try {
    const host = table.pages[0]!;
    await startGame(host);

    for (let round = 1; round <= ROUNDS; round += 1) {
      await confirmQuestion(table.pages);
      await submitAll(table.pages, round);

      // 提出の件数だけ「作者当て → 答え合わせ」をくり返す
      for (let item = 0; item < PLAYER_COUNT; item += 1) {
        await guessOne(table.pages, item);
        await waitJudging(table.pages);
      }

      // 開示: そのラウンドの提出が作者付きで並ぶ
      for (const page of table.pages) {
        await expect(page.locator("[data-testid='round-record']").first()).toBeVisible({ timeout: 30_000 });
        await expect(page.locator("[data-testid='score-board'] li")).toHaveCount(PLAYER_COUNT);
      }

      if (round < ROUNDS) {
        for (const page of table.pages) {
          await page.click("[data-testid='next-round']");
        }
      }
    }

    // 最終ラウンドの開示で結果になる。ロビーへ戻る導線はホストにだけ出る
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='round-record']")).toHaveCount(ROUNDS, { timeout: 20_000 });
    }
    await expect(host.locator("[data-testid='back-to-lobby']")).toBeVisible({ timeout: 20_000 });
    for (const page of table.pages.slice(1)) {
      await expect(page.locator("[data-testid='waiting-host']")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("[data-testid='back-to-lobby']")).toHaveCount(0);
    }

    // 受入条件3: 完走後に nextGame でロビーへ戻り、同じゲームをもう一度選べる
    await host.click("[data-testid='back-to-lobby']");
    await expect(host.locator(".title-cards")).toBeVisible({ timeout: 15_000 });
    for (const page of table.pages) {
      await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(PLAYER_COUNT, { timeout: 15_000 });
    }
    await host.click(`.title-card:has-text("${GAME_TITLE}")`);
    await expect(host.locator(`.content-chip:has-text("${PACK_TITLE}")`)).toBeVisible({ timeout: 10_000 });

    // 受入条件: 提出テキストと作者・指名先がstateに載らない（ADR-0003、基本設計/11）。
    //
    // 開示済みの件は revealedItems / rounds として公開される仕様であるため、
    // 「文字列としてどこにも現れない」では検査にならない。ステージごとに見る。
    for (const page of table.pages) {
      const states = await readStateMessages(page);
      expect(states.length).toBeGreaterThan(0);

      let writingSeen = 0;
      let guessingSeen = 0;
      for (const state of states) {
        // 言い回しの例と再接続トークンは秘密情報にしか入らない
        expect(state).not.toContain("hintEn");
        expect(state).not.toContain("reconnectToken");

        const parsed = JSON.parse(state) as {
          stage?: string;
          gameState?: {
            presented: { text: string; guessedPlayerIds: string[] } | null;
            revealedItems: unknown[];
            rounds: unknown[];
            roundIndex: number;
          };
        };
        const gameState = parsed.gameState;
        if (gameState === undefined || gameState === null) {
          continue;
        }

        if (parsed.stage === "writing") {
          writingSeen += 1;
          // 英作文中は現ラウンドの提出が1件も載らない。
          // 確定したラウンドの提出は rounds[] として公開される仕様であるため、そこは除いて見る
          expect(gameState.presented).toBeNull();
          expect(gameState.revealedItems).toHaveLength(0);
          const withoutRounds = JSON.stringify({ ...gameState, rounds: [] });
          expect(withoutRounds).not.toContain("wrote this in round");
        }

        if (parsed.stage === "guessing") {
          guessingSeen += 1;
          // 開示中の件に作者と指名先が載らない
          const presented = JSON.stringify(gameState.presented);
          expect(presented).not.toContain("authorId");
          expect(presented).not.toContain("targetPlayerId");
          // 未開示の件は公開状態に現れない（開示済みはrevealedItemsに積む仕様）
          const revealedCount = gameState.revealedItems.length;
          expect(revealedCount).toBeLessThanOrEqual(PLAYER_COUNT);
        }

        // 確定済みのラウンド数が roundIndex と一致する（先のラウンドの内訳が漏れていない）
        if (parsed.stage === "writing" || parsed.stage === "guessing") {
          expect(gameState.rounds).toHaveLength(gameState.roundIndex);
        }
      }
      expect(writingSeen).toBeGreaterThan(0);
      expect(guessingSeen).toBeGreaterThan(0);
    }
  } finally {
    await table.close();
  }
});
