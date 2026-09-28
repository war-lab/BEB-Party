// BLIND ROOMの通し検証（docs/実装計画/ゲーム構想20案の収録計画.md のP2）
// 部屋作成から結果まで通ることと、見本と聞き手の盤面がstateに載らないことを確かめる。
//
// 進行はすべて操作で進む（説明者の開始、聞き手の完了申告）。締切待ちは発生しないが、
// 6ラウンド分の操作があるためタイムアウトを長く取る。6人・1周と、下限の3人・2周の2通りで通す。
import { expect, test, type Page } from "@playwright/test";
import { openTable, readStateMessages } from "./support/room";

const GAME_TITLE = "BLIND ROOM";
const PACK_TITLE = "部屋のもの";
const PLACE_COUNT = 5;

/** 通しで確かめる卓の組み立て */
interface Scenario {
  title: string;
  levels: number[];
  /** 選ぶ盤面の広さのチップ。既定と違う広さを選び、選択がサーバまで届くことを確かめる */
  boardLabel: string;
  boardCells: number;
  /** 周回のチップ。undefined なら既定（1周）のまま開始する */
  lapsLabel?: string;
  laps: number;
}

const SCENARIOS: Scenario[] = [
  // 上級（4×4）で通す
  {
    title: "6人で部屋作成からBLIND ROOMの結果まで進める",
    levels: [5, 4, 3, 3, 2, 1],
    boardLabel: "上級 4×4",
    boardCells: 16,
    laps: 1,
  },
  // 対応人数の下限と2周（12のロビーの記述子と設定）。入門（3×3）で通す
  {
    title: "3人・2周でBLIND ROOMの結果まで進め、全員が2回ずつ説明者を務める",
    levels: [4, 2, 1],
    boardLabel: "入門 3×3",
    boardCells: 9,
    lapsLabel: "2周",
    laps: 2,
  },
];

// 配置の締切は上限にする。テストは完了申告で進めるため締切に依存せず、
// 全ラウンド分の操作が締切に追い越されないようにする
/** ホストがBLIND ROOMとお題パックを選び、配置の秒数を指定して開始する */
async function startBlindRoom(host: Page, scenario: Scenario, buildingSeconds = 120): Promise<void> {
  await host.click(`.title-card:has-text("${GAME_TITLE}")`);
  await host.click(`.content-chip:has-text("${PACK_TITLE}")`);
  await host.click(`.content-chip:has-text("${scenario.boardLabel}")`);
  if (scenario.lapsLabel) {
    await host.click(`.content-chip:has-text("${scenario.lapsLabel}")`);
  }
  await host.fill("label.seconds input[type='number']", String(buildingSeconds));
  // onchangeで送るため、focusを外して確定させる
  await host.locator("label.seconds input[type='number']").blur();
  await host.click(".beb-btn:has-text('ゲームスタート')");
}

/** そのラウンドの説明者のページを返す。伏せ面は説明者にだけ出る */
async function findDescriber(pages: Page[], round: number, totalRounds: number): Promise<number> {
  // 全員が交代の画面へ入るまで待つ。briefingに残ったページを数えると説明者が0人になる
  for (const page of pages) {
    await expect(page.locator("[data-testid='stage-timer']")).toContainText(`説明者の交代 ${round} / ${totalRounds}`, {
      timeout: 30_000,
    });
  }
  const flags = await Promise.all(pages.map((page) => page.locator("[data-testid='sample-cover']").isVisible()));
  const index = flags.findIndex(Boolean);
  // 説明者はちょうど1人。2人に見本が出ていたら配布が壊れている
  expect(flags.filter(Boolean)).toHaveLength(1);
  return index;
}

/**
 * 聞き手が5個を置いて「できた」を送る。
 *
 * 申告が受理されたことを人数の表示で確かめてから次の人へ進む。ここで待たないと、
 * 落ちた申告が「答え合わせへ進まない」という形で後段に出て、原因の切り分けができない。
 * doneの数はサーバの公開状態から来るため、往復が成立したことの確認になる。
 */
async function buildAndFinish(
  page: Page,
  doneCount: number,
  listenerCount: number,
  boardCells: number,
  round: number,
): Promise<void> {
  await expect(page.locator("[data-testid='my-board']")).toBeVisible({ timeout: 30_000 });
  // 選んだ広さがサーバまで届き、盤面のマス数になっている
  await expect(page.locator("[data-testid='my-board'] [data-testid^='cell-']")).toHaveCount(boardCells);
  for (let index = 0; index < PLACE_COUNT; index += 1) {
    await page.locator("[data-testid='palette'] button").nth(index).click();
    await page.locator(`[data-testid='cell-${index}']`).click();
  }
  await expect(page.locator("[data-testid='remaining']")).toContainText("あと 0 個");
  await page.click("[data-testid='done']");

  // 最後の1人の申告で答え合わせへ進むため、その回だけは人数の表示を待たない
  if (doneCount < listenerCount) {
    await expect(
      page.locator("[data-testid='done-count']"),
      `ラウンド${round}の${doneCount}人目の申告が反映されない`,
    ).toContainText(`できた ${doneCount} / ${listenerCount}`, { timeout: 20_000 });
  }
}

for (const scenario of SCENARIOS) {
  test(scenario.title, async ({ browser, baseURL }) => {
    test.setTimeout(360_000);
    const playerCount = scenario.levels.length;
    const totalRounds = playerCount * scenario.laps;
    const table = await openTable(browser, baseURL!, scenario.levels, {
      testTitle: test.info().title,
      record: true,
    });

    try {
      const host = table.pages[0]!;
      await startBlindRoom(host, scenario);

      // 部屋の確認: 全員がパレットを見てreadyを送る。説明者の人数と周回数が出る
      for (const page of table.pages) {
        await expect(page.locator("[data-testid='palette']")).toBeVisible({ timeout: 20_000 });
        await expect(page.locator("[data-testid='describer-note']")).toContainText(
          `説明者は${playerCount}人が${scenario.laps}回ずつ交代します（全${totalRounds}ラウンド）`,
        );
        await page.click("[data-testid='ready']");
      }

      // 各ページが説明者を務めた回数。周回数と同じになる
      const describedCount = table.pages.map(() => 0);
      for (let round = 1; round <= totalRounds; round += 1) {
        // 説明者の交代: 説明者だけが伏せ面を開いて開始する
        const describerIndex = await findDescriber(table.pages, round, totalRounds);
        describedCount[describerIndex] = (describedCount[describerIndex] ?? 0) + 1;
        const describer = table.pages[describerIndex]!;
        await describer.click("[data-testid='sample-cover']");
        await expect(describer.locator("[data-testid='sample-board']")).toBeVisible({ timeout: 10_000 });
        await describer.click("[data-testid='start-round']");

        // 配置: 聞き手が置いて申告する。全員が申告した時点で答え合わせへ進む
        const listeners = table.pages.filter((_, index) => index !== describerIndex);
        for (const [index, page] of listeners.entries()) {
          await buildAndFinish(page, index + 1, listeners.length, scenario.boardCells, round);
        }

        // 答え合わせ: 見本と聞き手の盤面が並ぶ
        for (const page of table.pages) {
          await expect(page.locator("[data-testid='stage-timer']")).toContainText(
            `答え合わせ ${round} / ${totalRounds}`,
            { timeout: 30_000 },
          );
          await expect(page.locator("[data-testid='round-record']")).toBeVisible({ timeout: 30_000 });
          await expect(page.locator("[data-testid='listener-board']")).toHaveCount(playerCount - 1);
          await expect(page.locator("[data-testid='score-board'] li")).toHaveCount(playerCount);
        }

        if (round < totalRounds) {
          for (const page of table.pages) {
            await page.click("[data-testid='next-round']");
          }
        }
      }
      expect(describedCount).toEqual(table.pages.map(() => scenario.laps));

      // 最終ラウンドの答え合わせで結果になる。ロビーへ戻る導線はホストにだけ出る
      await expect(host.locator("[data-testid='back-to-lobby']")).toBeVisible({ timeout: 20_000 });
      for (const page of table.pages.slice(1)) {
        await expect(page.locator("[data-testid='waiting-host']")).toBeVisible({ timeout: 20_000 });
        await expect(page.locator("[data-testid='back-to-lobby']")).toHaveCount(0);
      }

      // 完走後に nextGame でロビーへ戻り、同じゲームをもう一度選べる
      await host.click("[data-testid='back-to-lobby']");
      await expect(host.locator(".title-cards")).toBeVisible({ timeout: 15_000 });
      for (const page of table.pages) {
        await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(playerCount, { timeout: 15_000 });
      }
      await host.click(`.title-card:has-text("${GAME_TITLE}")`);
      await expect(host.locator(`.content-chip:has-text("${PACK_TITLE}")`)).toBeVisible({ timeout: 10_000 });

      // 受入条件: 見本と聞き手の盤面がstateに載らない（ADR-0003、基本設計/12）。
      //
      // 確定したラウンドは rounds として公開される仕様であるため、
      // 「文字列としてどこにも現れない」では検査にならない。ステージごとに見る。
      for (const page of table.pages) {
        const states = await readStateMessages(page);
        expect(states.length).toBeGreaterThan(0);

        let buildingSeen = 0;
        for (const state of states) {
          // 説明者の言い回しと再接続トークンは秘密情報にしか入らない
          expect(state).not.toContain("hintEn");
          expect(state).not.toContain("reconnectToken");

          const parsed = JSON.parse(state) as {
            stage?: string;
            gameState?: { rounds: unknown[]; roundIndex: number; palette: unknown[] };
          };
          const gameState = parsed.gameState;
          if (gameState === undefined || gameState === null) {
            continue;
          }

          if (parsed.stage === "handoff" || parsed.stage === "building") {
            if (parsed.stage === "building") {
              buildingSeen += 1;
            }
            // 進行中のラウンドの見本と盤面が公開状態に無い。
            // 確定済みのラウンドは rounds[] として公開される仕様のため、そこは除いて見る
            const withoutRounds = JSON.stringify({ ...gameState, rounds: [], palette: [] });
            expect(withoutRounds).not.toContain("sample");
            expect(withoutRounds).not.toContain("cells");
            expect(withoutRounds).not.toContain("matched");
            // 確定済みのラウンド数が roundIndex と一致する（先のラウンドの内訳が漏れていない）
            expect(gameState.rounds).toHaveLength(gameState.roundIndex);
          }
        }
        expect(buildingSeen).toBeGreaterThan(0);
      }
    } finally {
      await table.close();
    }
  });
}

test("遊び方からBLIND ROOMのルールを読める", async ({ browser, baseURL }) => {
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
    await expect(sheet).toContainText("見本");
    await expect(sheet).toContainText("説明者の交代");
    // プレイ中でなくても、他ゲームの説明は混ざらない
    await expect(sheet).not.toContainText("禁止語");
  } finally {
    await table.close();
  }
});
