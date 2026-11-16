// SECRET TEAMSの通し検証（基本設計/17_SECRETTEAMSゲームモジュール.md のテスト観点「通しE2E」）。
// 部屋作成から結果まで通ること、どの参加者の画面にも他人の単語と味方の所属が回答前に出ないこと、
// 回答の上書きが効くこと、得点が画面の操作どおりに計算されることを確かめる。
// 対応人数の両端（4人と8人）で通す（ADR-0033）。8人の実行時間と安定性は未検証である。
import { expect, test } from "@playwright/test";
import { clickReady, openSeat, screenShowsWord, submitAnswer, waitForStage, waitForTurn, type Seat } from "./support/secretteams";
import { openTable, readStateMessages } from "./support/room";

const GAME_TITLE = "SECRET TEAMS";
const PACK_TITLE = "はじめてのテーマ";
const LAPS = 2;

/** 回答の作り方。index はチームの中の並び（画面で読んだ順） */
type Plan = "perfect" | "oneWrongAlly" | "wrongTheme" | "wrongAllyAndTheme";

interface Table {
  levels: number[];
  timeout: number;
  /** [先に読めたチーム, もう一方のチーム] のメンバーごとの回答 */
  plans: [Plan[], Plan[]];
  /** 上書きを試す（最初に完全な回答を送り、計画どおりの回答で送り直す）メンバー */
  overwrite: [number, number];
}

const TABLES: Table[] = [
  {
    levels: [1, 3, 4, 2],
    timeout: 240_000,
    plans: [
      ["perfect", "wrongAllyAndTheme"],
      ["perfect", "wrongTheme"],
    ],
    overwrite: [0, 1],
  },
  {
    levels: [5, 4, 4, 3, 3, 2, 1, 1],
    timeout: 480_000,
    plans: [
      ["perfect", "oneWrongAlly", "wrongTheme", "perfect"],
      ["perfect", "perfect", "perfect", "perfect"],
    ],
    overwrite: [0, 2],
  },
];

/** 計画から回答を作り、その回答で期待する合流の値と見抜きの値を返す */
function answerFor(
  plan: Plan,
  seat: Seat,
  own: Seat[],
  opponent: Seat[],
  maxAllyPicks: number,
  otherThemeId: string,
): { allyIds: string[]; opponentThemeId: string; join: number; spot: number } {
  const allies = own.filter((member) => member !== seat).map((member) => member.playerId);
  const enemy = opponent[0]!.playerId;
  const allyCount = allies.length;
  const opponentThemeId = opponent[0]!.themeId;
  switch (plan) {
    case "perfect":
      return { allyIds: allies.slice(0, maxAllyPicks), opponentThemeId, join: 1, spot: 1 };
    case "oneWrongAlly": {
      // 味方を (上限 − 1) 人と相手を1人選ぶ。合流の値は max(0, 正 − 誤) ÷ 味方の数
      const picked = allies.slice(0, maxAllyPicks - 1);
      return {
        allyIds: [...picked, enemy],
        opponentThemeId,
        join: Math.max(0, picked.length - 1) / allyCount,
        spot: 1,
      };
    }
    case "wrongTheme":
      return { allyIds: allies.slice(0, maxAllyPicks), opponentThemeId: otherThemeId, join: 1, spot: 0 };
    case "wrongAllyAndTheme":
      return { allyIds: [enemy], opponentThemeId: otherThemeId, join: 0, spot: 0 };
  }
}

for (const table of TABLES) {
  test(`${table.levels.length}人で部屋作成からSECRET TEAMSの結果まで進み、他人の単語と味方の所属が回答前に漏れない`, async ({
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
      const seats: Seat[] = [];
      for (const page of pages) {
        seats.push(await openSeat(page));
      }
      // 2つのテーマに分かれ、各自の単語は重ならない
      const themeIds = [...new Set(seats.map((seat) => seat.themeId))];
      expect(themeIds).toHaveLength(2);
      expect(new Set(seats.map((seat) => seat.word)).size).toBe(seats.length);
      const teams = themeIds.map((themeId) => seats.filter((seat) => seat.themeId === themeId)) as [Seat[], Seat[]];
      const sizes = teams.map((team) => team.length).sort((a, b) => b - a);
      await expect(host.locator("[data-testid='team-sizes']")).toHaveText(sizes.map((size) => `${size}人`).join(" 対 "));
      const maxAllyPicks = Math.max(...sizes) - 1;

      /** どの画面にも他人の単語が出ず、stateのブロードキャストに単語とチームの所属が載らないことを確かめる */
      const checkNoLeak = async (where: string) => {
        for (const seat of seats) {
          for (const other of seats) {
            if (other !== seat) {
              expect(await screenShowsWord(seat.page, other.word), `${where}: ${seat.playerId} の画面に ${other.word}`).toBe(false);
            }
          }
        }
        for (const page of pages) {
          for (const message of await readStateMessages(page)) {
            for (const seat of seats) {
              expect(message, where).not.toContain(JSON.stringify(seat.word));
            }
            for (const key of ['"playerIds"', '"words"', '"answers"', '"allyIds"', '"opponentThemeId"', '"themeId"']) {
              expect(message, where).not.toContain(key);
            }
          }
        }
      };
      await checkNoLeak("briefing");

      await clickReady(pages);
      const totalTurns = seats.length * LAPS;
      for (let turnIndex = 0; turnIndex < totalTurns; turnIndex += 1) {
        const speakerId = await waitForTurn(host, turnIndex);
        const speaker = seats.find((seat) => seat.playerId === speakerId)!;
        // 説明を終えるボタンは手番の人の画面にだけ出る
        for (const seat of seats) {
          await expect(seat.page.locator("[data-testid='done']")).toHaveCount(seat === speaker ? 1 : 0, { timeout: 10_000 });
        }
        if (turnIndex === 1) {
          await checkNoLeak("clue");
        }
        await speaker.page.click("[data-testid='done']");
      }

      await waitForStage(pages, "回答");
      const expected = new Map<string, { join: number; spot: number; size: number }>();
      const submissions: { seat: Seat; allyIds: string[]; opponentThemeId: string; overwrite: boolean }[] = [];
      for (const [teamIndex, team] of teams.entries()) {
        const opponent = teams[1 - teamIndex]!;
        // 外れのテーマ: 自分のテーマでも相手のテーマでもない選択肢
        const otherThemeId = await host
          .locator("[data-testid='theme-option']")
          .evaluateAll(
            (nodes, used) => nodes.map((node) => node.getAttribute("data-theme-id") ?? "").find((id) => !used.includes(id)) ?? "",
            themeIds,
          );
        let join = 0;
        let spot = 0;
        for (const [index, seat] of team.entries()) {
          const answer = answerFor(table.plans[teamIndex]![index]!, seat, team, opponent, maxAllyPicks, otherThemeId);
          join += answer.join;
          spot += answer.spot;
          submissions.push({
            seat,
            allyIds: answer.allyIds,
            opponentThemeId: answer.opponentThemeId,
            overwrite: table.overwrite[teamIndex] === index,
          });
        }
        expected.set(team[0]!.themeId, { join: join / team.length, spot: spot / team.length, size: team.length });
      }

      // 上書きを試す人は、最初に別の回答を送ってから、他の人より先に計画どおりの回答で送り直す。
      // 送り直しを後に回すと、他の全員の回答が揃った時点で結果へ進み、送り直せない
      for (const submission of submissions.filter((entry) => entry.overwrite)) {
        const { seat } = submission;
        const own = seats.filter((other) => other.themeId === seat.themeId && other !== seat).map((other) => other.playerId);
        const opponentTheme = themeIds.find((id) => id !== seat.themeId)!;
        await submitAnswer(seat.page, own.slice(0, 1), opponentTheme);
      }
      const ordered = [...submissions.filter((entry) => entry.overwrite), ...submissions.filter((entry) => !entry.overwrite)];
      for (const [order, submission] of ordered.entries()) {
        const { seat } = submission;
        if (order === ordered.length - 1) {
          // 最後の1人の回答の前に、回答の中身が誰の画面にもstateにも出ていないことを確かめる
          await checkNoLeak("answering");
        }
        await submitAnswer(seat.page, submission.allyIds, submission.opponentThemeId);
      }

      await waitForStage(pages, "結果");
      for (const page of pages) {
        await expect(page.locator("[data-testid='team-result']")).toHaveCount(2, { timeout: 30_000 });
      }
      const scores = new Map<string, number>();
      for (const [themeId, rates] of expected) {
        const score = Math.round(rates.join * 50 + rates.spot * 50 + 1e-9);
        scores.set(themeId, score);
        await expect(host.locator(`[data-testid='team-result'][data-theme-id='${themeId}'] [data-testid='team-score']`)).toHaveText(
          `${score}点`,
        );
        await expect(host.locator(`[data-testid='team-result'][data-theme-id='${themeId}'] [data-testid='team-member']`)).toHaveCount(
          rates.size,
        );
      }
      const [firstScore, secondScore] = themeIds.map((themeId) => scores.get(themeId)!);
      if (firstScore === secondScore) {
        await expect(host.locator("[data-testid='winner']")).toContainText("DRAW!");
      } else {
        await expect(host.locator("[data-testid='winner']")).toContainText("WINS!");
      }
      await expect(host.locator("[data-testid='answer-record']")).toHaveCount(seats.length);
      // 結果では全員の単語が出る
      for (const seat of seats) {
        await expect(host.locator(`[data-testid='team-member'][data-player-id='${seat.playerId}']`)).toContainText(seat.word);
      }
      await expect(host.locator("[data-testid='picked-me']")).toBeVisible();

      // 不変条件2。ゲーム秘密状態（チームの所属・単語・回答）は最後までstateに載らない
      const states = (await Promise.all(pages.map((page) => readStateMessages(page)))).flat();
      expect(states.length).toBeGreaterThan(0);
      for (const message of states) {
        expect(message).not.toContain('"playerIds"');
        expect(message).not.toContain('"answers"');
        expect(message).not.toContain('"allyIds"');
      }
    } finally {
      await opened.close();
    }
  });
}
