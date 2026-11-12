// MIND MELDの通し検証（基本設計/15_MINDMELDゲームモジュール.md のテスト観点「通しE2E」）。
// 部屋作成から結果まで通ること、input 中に他人の画面とstateへ提出した語が出ないこと、
// 近い語の申告と異議を画面から操作できること、得点が画面の操作どおりに積み上がることを確かめる。
// 対応人数の両端（4人と8人）で通す（ADR-0033）。8人の実行時間と安定性は未検証である。
import { expect, test, type Page } from "@playwright/test";
import {
  clickReady,
  isActive,
  readMyTeam,
  submitWord,
  syntheticWord,
  waitForReveal,
  waitForStage,
} from "./support/mindmeld";
import { openTable, readStateMessages } from "./support/room";

const GAME_TITLE = "MIND MELD";
const PACK_TITLE = "はじめてのお題";
const MAX_ROUNDS = 4;
const MAX_ATTEMPTS = 4;

interface Table {
  levels: number[];
  timeout: number;
  /** チームの並び（画面に出た順）の index とラウンドから、何回目で一致させるか。null は一致させない */
  matchAt: (teamIndex: number, roundIndex: number) => number | null;
  /** 最初の試行で、先頭のチームに近い語を出させて申告と異議を通すか */
  claimScenario: boolean;
}

const TABLES: Table[] = [
  {
    levels: [1, 3, 4, 2],
    timeout: 240_000,
    matchAt: (teamIndex, roundIndex) => (teamIndex === 0 ? 1 : roundIndex === 0 ? 2 : (roundIndex % 2) + 1),
    claimScenario: true,
  },
  {
    levels: [5, 4, 4, 3, 3, 2, 1, 1],
    timeout: 480_000,
    // 最初のお題は1〜3回目と、試行の上限まで一致しないチームを混ぜる
    matchAt: (teamIndex, roundIndex) => (roundIndex === 0 ? ([1, 2, 3, null][teamIndex] ?? null) : ((teamIndex + roundIndex) % 2) + 1),
    claimScenario: false,
  },
];

for (const table of TABLES) {
  test(`${table.levels.length}人で部屋作成からMIND MELDの結果まで進み、提出した語がinput中に漏れない`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(table.timeout);
    const opened = await openTable(browser, baseURL!, table.levels, { record: true, testTitle: test.info().title });

    try {
      const pages = opened.pages;
      const host = pages[0]!;
      await host.click(`.title-card:has-text("${GAME_TITLE}")`);
      await host.click(`.content-chip:has-text("${PACK_TITLE}")`);
      await host.click(".beb-btn:has-text('ゲームスタート')");

      await waitForStage(pages, "遊び方の確認");
      // チームは全員に公開される。各端末の「あなた」のチームを読む
      const teamOfPage = await Promise.all(pages.map((page) => readMyTeam(page)));
      const teamIds = await host
        .locator("[data-testid='team-list'] [data-testid='team-chip']")
        .evaluateAll((chips) => chips.map((chip) => chip.getAttribute("data-team-id") ?? ""));
      expect(teamIds).toHaveLength(table.levels.length / 2);
      expect(new Set(teamOfPage).size).toBe(teamIds.length);
      await clickReady(pages);

      const expected = new Map(teamIds.map((teamId) => [teamId, 0]));
      let counter = 0;
      let leakChecked = false;

      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const matched = new Set<string>();
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          await waitForStage(pages, `語を出す お題${round + 1}/${MAX_ROUNDS}・${attempt}回目`);
          if (round === MAX_ROUNDS - 1) {
            await expect(host.locator("[data-testid='final-round']")).toBeVisible();
          }

          // この試行で語を出す端末をチームごとに集める
          const speakers = new Map<string, Page[]>();
          for (const [index, page] of pages.entries()) {
            if (await isActive(page)) {
              const teamId = teamOfPage[index]!;
              speakers.set(teamId, [...(speakers.get(teamId) ?? []), page]);
            }
          }
          // 一致したチームは語を出さない。ペアは2人とも語を出す
          expect([...speakers.keys()].sort()).toEqual(teamIds.filter((teamId) => !matched.has(teamId)).sort());

          const claiming = table.claimScenario && round === 0 && attempt === 1 ? teamIds[0]! : null;
          for (const [teamId, members] of speakers) {
            expect(members).toHaveLength(2);
            counter += 1;
            const match = table.matchAt(teamIds.indexOf(teamId), round) === attempt;
            const words =
              teamId === claiming
                ? ["apple", "apples"]
                : [syntheticWord(counter, "left"), match ? syntheticWord(counter, "left") : syntheticWord(counter, "right")];
            await submitWord(members[0]!, words[0]!);

            // 近い語の申告に使う apple は言い回しの例文にも現れるため、作った語でだけ確かめる
            if (!leakChecked && teamId !== claiming) {
              // 提出した語は、開示まで他人の画面にもstateのブロードキャストにも出ない（不変条件2、15の公開状態）
              const others = pages.filter((page) => page !== members[0]);
              for (const page of others) {
                await expect(page.locator("main")).not.toContainText(words[0]!);
              }
              for (const page of pages) {
                for (const message of await readStateMessages(page)) {
                  expect(message).not.toContain(words[0]!);
                }
              }
              leakChecked = true;
            }
            await submitWord(members[1]!, words[1]!);
          }

          await waitForReveal(pages);
          if (claiming !== null) {
            // 近い語の申告と異議。4人の卓では判定者2人のうち1人の異議では退けられない（15の「近い語の申告と異議」）
            const claimer = speakers.get(claiming)![0]!;
            await claimer.click("[data-testid='claim']");
            const judge = pages[teamOfPage.findIndex((teamId) => teamId !== claiming)]!;
            await judge.click(`[data-testid='reveal-row'][data-team-id='${claiming}'] [data-testid='object']`);
            for (const page of pages) {
              const row = page.locator(`[data-testid='reveal-row'][data-team-id='${claiming}']`);
              await expect(row.locator("[data-testid='objectors'] .face")).toHaveCount(1, { timeout: 10_000 });
              await expect(row.locator("[data-testid='claim-forecast']")).toHaveText("このままなら認められる");
            }
          }
          for (const teamId of speakers.keys()) {
            if (table.matchAt(teamIds.indexOf(teamId), round) === attempt) {
              matched.add(teamId);
              expected.set(teamId, (expected.get(teamId) ?? 0) + MAX_ATTEMPTS + 1 - attempt);
            }
          }
          await clickReady(pages);
          if (matched.size === teamIds.length) {
            break;
          }
        }
      }

      await waitForStage(pages, "結果");
      for (const page of pages) {
        await expect(page.locator("[data-testid='standing']")).toHaveCount(teamIds.length, { timeout: 30_000 });
      }
      for (const [teamId, points] of expected) {
        await expect(host.locator(`[data-testid='standing'][data-team-id='${teamId}'] .points`)).toContainText(`${points}点`);
      }
      await expect(host.locator("[data-testid='round-record']")).toHaveCount(MAX_ROUNDS);
      if (table.claimScenario) {
        await expect(host.locator("[data-testid='claim-record']").first()).toContainText("申告");
      }

      // 不変条件2。ゲーム秘密状態（後のお題・提出中の語・交代の数え）はstateに載らない
      const states = (await Promise.all(pages.map((page) => readStateMessages(page)))).flat();
      expect(states.length).toBeGreaterThan(0);
      for (const message of states) {
        expect(message).not.toContain("currentWords");
        expect(message).not.toContain('"prompts"');
        expect(message).not.toContain("trioTurns");
      }
    } finally {
      await opened.close();
    }
  });
}
