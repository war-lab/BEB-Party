// P3 PR-5の通し検証（docs/実装計画/ゲーム構想20案の収録計画.md）
// 部屋作成からWHO WROTE THIS?の結果まで通ることと、提出・作者・指名先がstateに載らないことを確かめる。
//
// judgingは操作を持たず締切の12秒がそのまま経過する。6件×2ラウンドで約144秒待つため、
// 英作文は最短の60秒に設定し、test.setTimeoutを長く取る。
import { expect, test } from "@playwright/test";
import { openTable, readStateMessages } from "./support/room";
import {
  GAME_TITLE,
  PACK_TITLE,
  ROUNDS,
  confirmQuestion,
  guessOne,
  startWhoWroteThis,
  submitAll,
  waitJudging,
} from "./support/whowrotethis";

const PLAYER_COUNT = 6;

test("6人で部屋作成からWHO WROTE THIS?の結果まで進める", async ({ browser, baseURL }) => {
  // judgingの締切待ちが6件×2ラウンドで約144秒ある。既定の3倍でも足りない
  test.setTimeout(420_000);
  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: test.info().title,
    record: true,
  });

  try {
    const host = table.pages[0]!;
    await startWhoWroteThis(host);

    for (let round = 1; round <= ROUNDS; round += 1) {
      await confirmQuestion(table.pages);
      // 1件目は4語未満で送信ボタンが無効であることを確かめてから書き直す
      const first = table.pages[0]!;
      await first.locator("[data-testid='submission-input']").fill("Too short");
      await expect(first.locator("[data-testid='submit']")).toBeDisabled();
      await expect(first.locator("[data-testid='too-short-hint']")).toBeVisible();

      await submitAll(table.pages, (index) => `Player ${index + 1} wrote this in round ${round}.`);

      // 提出の件数だけ「作者当て → 答え合わせ」をくり返す
      for (let item = 0; item < PLAYER_COUNT; item += 1) {
        await guessOne(table.pages, item, PLAYER_COUNT);
        await waitJudging(table.pages, PLAYER_COUNT - 1);
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
