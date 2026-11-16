// TWO-HEADED SPEAKERの通し検証（基本設計/16_TWOHEADEDゲームモジュール.md のテスト観点「通しE2E」）。
// 部屋作成から結果まで通ること、説明役のペアの全員に同じお題が届き、当てる側の画面とstateにお題が出ないこと、
// 話す順がお題ごとに入れ替わること、得点が画面の申告どおりに積み上がることを確かめる。
//
// explaining の締切（既定90秒）を待つとテストが長くなるため、各手番で消費上限（5回）まで正解と送りを申告して終える。
// 対応人数の両端（6人と8人）と、3人組ができる7人で通す（ADR-0033）。6人は既定の2周、7人と8人は1周にする。
import { expect, test, type Page } from "@playwright/test";
import { openTable, readStateMessages } from "./support/room";
import {
  claimCorrect,
  openCutIn,
  readAnswer,
  readMyTeam,
  readTeamOrder,
  readyAll,
  waitForStage,
} from "./support/twoheaded";

const GAME_TITLE = "TWO-HEADED SPEAKER";
const SET_TITLE = "Everyday Things";
/** 1手番の消費上限。MAX_CARDS_PER_TURN（shared/games/twoheaded）と同じ値 */
const MAX_CARDS_PER_TURN = 5;

interface Table {
  levels: number[];
  /** 周回のチップの文言。undefined なら既定（2周）のまま開始する */
  lapsLabel?: string;
  laps: number;
  timeout: number;
}

const TABLES: Table[] = [
  { levels: [5, 4, 3, 3, 2, 1], laps: 2, timeout: 360_000 },
  { levels: [5, 4, 4, 3, 2, 1, 1], lapsLabel: "1周（全員が1回ずつ説明）", laps: 1, timeout: 300_000 },
  { levels: [5, 4, 4, 3, 3, 2, 1, 1], lapsLabel: "1周（全員が1回ずつ説明）", laps: 1, timeout: 360_000 },
];

for (const table of TABLES) {
  test(`${table.levels.length}人・${table.laps}周で部屋作成からTWO-HEADED SPEAKERの結果まで進み、当てる側にお題が出ない`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(table.timeout);
    const opened = await openTable(browser, baseURL!, table.levels, { record: true, testTitle: test.info().title });

    try {
      const pages = opened.pages;
      const host = pages[0]!;
      await host.click(`.title-card:has-text("${GAME_TITLE}")`);
      await expect(host.locator("h2:has-text('お題セットを選ぶ')")).toBeVisible({ timeout: 10_000 });
      await host.click(`.content-chip:has-text("${SET_TITLE}")`);
      if (table.lapsLabel !== undefined) {
        await host.click(`.content-chip:has-text("${table.lapsLabel}")`);
      }
      await host.click(".beb-btn:has-text('ゲームスタート')");

      await waitForStage(pages, "遊び方の確認");
      // ペアは全員に公開される。各端末の「あなたのペア」を読む
      const teamOfPage = await Promise.all(pages.map((page) => readMyTeam(page)));
      const teamIds = await readTeamOrder(host);
      const expectedTeams = Math.floor(table.levels.length / 2);
      expect(teamIds).toHaveLength(expectedTeams);
      expect(new Set(teamOfPage).size).toBe(expectedTeams);
      const sizes = teamIds.map((teamId) => teamOfPage.filter((own) => own === teamId).length).sort();
      expect(sizes).toEqual(table.levels.length === 7 ? [2, 2, 3] : Array.from({ length: expectedTeams }, () => 2));
      await readyAll(pages);

      const turns = teamIds.length * table.laps;
      const expected = new Map(teamIds.map((teamId) => [teamId, 0]));
      let totalCards = 0;

      for (let turn = 0; turn < turns; turn += 1) {
        await waitForStage(pages, `交代 ${turn + 1} / ${turns}`);
        const explainerTeamId = teamIds[turn % teamIds.length]!;
        const explainers = pages.filter((_, index) => teamOfPage[index] === explainerTeamId);
        const guessers = pages.filter((page) => !explainers.includes(page));
        const others = teamIds.filter((teamId) => teamId !== explainerTeamId);

        // 説明役のペアの全員に伏せ面が出て、当てる側には出ない
        await expect(host.locator("[data-testid='next-explainers']")).toHaveAttribute("data-team-id", explainerTeamId);
        for (const page of explainers) {
          await expect(page.locator("[data-testid='explainer-cover']")).toBeVisible({ timeout: 10_000 });
        }
        for (const page of guessers) {
          await expect(page.locator("[data-testid='explainer-cover']")).toHaveCount(0);
        }
        // 説明役のペアの全員に同じお題が届く（16の秘密情報）
        const cutInAnswers = [];
        for (const page of explainers) {
          cutInAnswers.push(await openCutIn(page));
        }
        expect(new Set(cutInAnswers).size).toBe(1);
        const firstAnswer = cutInAnswers[0]!;
        for (const page of guessers) {
          await expect(page.locator("[data-testid='cutin-answer']")).toHaveCount(0);
          if (turn === 0) {
            await expect(page.locator("main")).not.toContainText(firstAnswer);
          }
        }
        // 最初に話す人の端末にだけ「あなたから」が出る
        const firstSpeakers = await Promise.all(
          pages.map((page) => page.locator("[data-testid='you-first']").first().isVisible()),
        );
        expect(firstSpeakers.filter((visible) => visible)).toHaveLength(1);
        expect(explainers).toContain(pages[firstSpeakers.indexOf(true)]);

        await explainers[explainers.length - 1]!.click("[data-testid='start-turn']");
        await waitForStage(pages, "説明タイム");

        let previousFirst: string | null = null;
        for (let card = 0; card < MAX_CARDS_PER_TURN; card += 1) {
          // 説明役のペアは交代で操作する。どちらが申告してもよい
          const operator = explainers[card % explainers.length]!;
          const answer = await readAnswer(operator);
          for (const page of explainers) {
            await expect(page.locator("[data-testid='answer']")).toHaveText(answer);
          }
          for (const page of guessers) {
            await expect(page.locator("[data-testid='guesser-view']")).toBeVisible();
            await expect(page.locator("[data-testid='explainer-view']")).toHaveCount(0);
            await expect(page.locator("[data-testid='forbidden-words']")).toHaveCount(0);
          }
          // 終えていないお題はstateのブロードキャストに載らない（不変条件2、16の公開状態）
          if (card === 0) {
            for (const page of pages) {
              for (const message of await readStateMessages(page)) {
                expect(message).not.toContain(JSON.stringify(answer));
              }
            }
          }
          // 話す順はお題ごとに先頭がずれる（16の「話す順の決め方」）
          const firstId = await guessers[0]!.locator("[data-testid='speaking-order']").getAttribute("data-first-id");
          expect(firstId).not.toBeNull();
          if (previousFirst !== null) {
            expect(firstId).not.toBe(previousFirst);
          }
          previousFirst = firstId;

          if (card % 2 === 0) {
            const guessed = others[(turn + card) % others.length]!;
            await claimCorrect(operator, guessed);
            expected.set(explainerTeamId, (expected.get(explainerTeamId) ?? 0) + 1);
            expected.set(guessed, (expected.get(guessed) ?? 0) + 1);
          } else {
            await operator.click("[data-testid='pass-card']");
          }
          totalCards += 1;

          if (card < MAX_CARDS_PER_TURN - 1) {
            // 終えたお題の答えと結果が当てる側の画面にも出る（16の lastCard）
            const lastCard = guessers[0]!.locator("[data-testid='last-card']");
            await expect(lastCard).toContainText(answer, { timeout: 10_000 });
            await expect(lastCard).toHaveAttribute("data-outcome", card % 2 === 0 ? "solved" : "passed");
          }
        }
        // 消費上限に達した時点で手番が終わる
        if (turn < turns - 1) {
          await waitForStage(pages, `交代 ${turn + 2} / ${turns}`);
          for (const teamId of teamIds) {
            await expect(host.locator(`[data-testid='pair-score'][data-team-id='${teamId}'] .points`)).toHaveText(
              `${expected.get(teamId)}点`,
            );
          }
        }
      }

      await waitForStage(pages, "結果");
      for (const page of pages) {
        await expect(page.locator("[data-testid='standing']")).toHaveCount(teamIds.length, { timeout: 30_000 });
      }
      for (const [teamId, points] of expected) {
        await expect(host.locator(`[data-testid='standing'][data-team-id='${teamId}'] .points`)).toHaveText(`${points}点`);
      }
      await expect(host.locator("[data-testid='used-card']")).toHaveCount(totalCards);
      await expect(host.locator("[data-testid='used-card'][data-outcome='solved']")).toHaveCount(turns * 3);

      // 不変条件2。ゲーム秘密状態（山札・表示中のお題・通し番号）はstateに載らない
      const states = (await Promise.all(pages.map((page: Page) => readStateMessages(page)))).flat();
      expect(states.length).toBeGreaterThan(0);
      for (const message of states) {
        expect(message).not.toContain('"deck"');
        expect(message).not.toContain("currentCardId");
        expect(message).not.toContain("cardsExplained");
        expect(message).not.toContain("usedCards");
      }
    } finally {
      await opened.close();
    }
  });
}
