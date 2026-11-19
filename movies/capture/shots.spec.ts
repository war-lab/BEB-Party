// 10ゲームの全ステージの素材を撮る。
//
// 実アプリを実際にプレイして撮る（モックを描かない）。素材は movies/assets/shots/ へ出す。
// 各ゲームを1テストにするのは、途中で失敗しても他のゲームの素材が残るようにするためである。
//
// 卓を立てるところは検証用のE2Eヘルパー（e2e/support/room.ts）を再利用する。
// 「人数分で入室してロビーに並ぶ」は撮影でも検証でも同じ手順であり、二重に持つ理由がない。
import { expect, test, type Page } from "@playwright/test";
import { collectPieces, enterCode, solve, waitForLock, wrongCodeFor } from "../../e2e/support/escapecall";
import * as mindmeld from "../../e2e/support/mindmeld";
import * as secretteams from "../../e2e/support/secretteams";
import * as twoheaded from "../../e2e/support/twoheaded";
import { openTable, startGame, voteAll } from "../../e2e/support/room";
import {
  BANK,
  PREDICATES,
  collectVerdicts,
  consistentCandidates,
  pickTests,
  readCandidates,
  submitText,
  waitForStage,
} from "../../e2e/support/secretrule";
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

test("BLIND ROOM", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, LEVELS, { testTitle: "blindroom" });
  try {
    const host = table.pages[0]!;
    // 盤面の広さは既定（標準 4×3）のまま撮る。配置の秒数は撮影が締切に追い越されない長さにする
    await startWith(host, "BLIND ROOM", "部屋のもの", 120);

    // briefing: 使うアイテムの一覧と、質問に使う言い回し
    await expect(host.locator("[data-testid='palette']")).toBeVisible({ timeout: 20_000 });
    await shoot(host, "blindroom-briefing");
    for (const page of table.pages) {
      await page.click("[data-testid='ready']");
    }

    // handoff: 伏せ面を撮ってから開く。開く前に撮ると全画面の伏せ面しか写らない（docs/ムービー.md）
    const describer = await findPageBy(table.pages, "[data-testid='sample-cover']");
    await shoot(describer, "blindroom-handoff-cover");
    await describer.click("[data-testid='sample-cover']");
    await expect(describer.locator("[data-testid='sample-board']")).toBeVisible({ timeout: 15_000 });
    await shoot(describer, "blindroom-handoff-sample");
    await describer.click("[data-testid='start-round']");

    // building: 聞き手が置いた状態と、説明者の手元
    const listeners = table.pages.filter((page) => page !== describer);
    const first = listeners[0]!;
    await expect(first.locator("[data-testid='my-board']")).toBeVisible({ timeout: 20_000 });
    for (let index = 0; index < 5; index += 1) {
      await first.locator("[data-testid='palette'] button").nth(index).click();
      await first.locator(`[data-testid='cell-${index * 2}']`).click();
    }
    await shoot(first, "blindroom-building-listener");
    await shoot(describer, "blindroom-building-describer");

    // reveal: 見本と全員の盤面。他の聞き手も少し置いてから申告する
    for (const page of listeners) {
      if (page !== first) {
        for (let index = 0; index < 3; index += 1) {
          await page.locator("[data-testid='palette'] button").nth(index + 2).click();
          await page.locator(`[data-testid='cell-${index * 3}']`).click();
        }
      }
      await page.click("[data-testid='done']");
    }
    await expect(host.locator("[data-testid='round-record']")).toBeVisible({ timeout: 30_000 });
    await shoot(host, "blindroom-reveal");
  } finally {
    await table.close();
  }
});

/**
 * ESCAPE CALLは2〜4人のゲームであり、6人の卓では開始できない。3人で撮る。
 * レベルを散らすのは、断片の割り当てがレベルで決まり（規則は最も高い人、対応表は最も低い人）、
 * 3種類の断片がそれぞれ別の端末に出るようにするためである（基本設計/13のレベル差の吸収）。
 */
const ESCAPE_LEVELS = [2, 5, 3];

test("ESCAPE CALL", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, ESCAPE_LEVELS, { testTitle: "escapecall" });
  try {
    const host = table.pages[0]!;
    await startWith(host, "ESCAPE CALL", "深夜の研究所");

    // briefing: 舞台の導入と、色と形の英語名
    await expect(host.locator("[data-testid='ready']")).toBeVisible({ timeout: 20_000 });
    await shoot(host, "escapecall-briefing");
    for (const page of table.pages) {
      await page.click("[data-testid='ready']");
    }

    // 錠1: 並びと対応表。どの端末に何が出るかはサーバが決めるため、見えている断片で探す
    await waitForLock(table.pages, 1);
    const orderHolder = await findPageBy(table.pages, "[data-testid='piece-order']");
    const mapHolder = await findPageBy(table.pages, "[data-testid='piece-map']");
    await shoot(orderHolder, "escapecall-solving-order");
    await shoot(mapHolder, "escapecall-solving-map");
    await enterCode(orderHolder, solve(await collectPieces(table.pages)));

    // 錠2: 規則が加わる。誤答とヒントを入れてから、入力と履歴の画面を撮る
    await waitForLock(table.pages, 2);
    const ruleHolder = await findPageBy(table.pages, "[data-testid='piece-rule']");
    // 錠が開いた直後は解錠の演出（UNLOCKED!）が画面に重なる。消えてから撮る（実測で写り込んだ）
    for (const page of table.pages) {
      await expect(page.locator("[data-testid='unlocked']")).toHaveCount(0, { timeout: 5_000 });
    }
    await shoot(ruleHolder, "escapecall-solving-rule");
    const second = solve(await collectPieces(table.pages));
    await enterCode(mapHolder, wrongCodeFor(second));
    await expect(host.locator("[data-testid='attempt']")).toHaveCount(1, { timeout: 15_000 });
    await host.click("[data-testid='hint']");
    await expect(host.locator(".slots li.hinted")).toHaveCount(1, { timeout: 15_000 });
    // 10キーと履歴は画面の下半分にある。錠の桁が上端に来る位置まで送ってから撮る
    await host.locator("[data-testid='lock']").evaluate((element) => element.scrollIntoView({ block: "start" }));
    await host.locator("[data-testid='keypad']").scrollIntoViewIfNeeded();
    await shoot(host, "escapecall-solving-attempts");
    await enterCode(mapHolder, second);

    // 錠3を開けて脱出する
    await waitForLock(table.pages, 3);
    await enterCode(ruleHolder, solve(await collectPieces(table.pages)));

    // debrief: 成否とランク、3つの錠の答えと断片
    await expect(host.locator("[data-testid='outcome']")).toBeVisible({ timeout: 30_000 });
    await shoot(host, "escapecall-debrief");
  } finally {
    await table.close();
  }
});

/**
 * SECRET RULE ENGLISHは4人で撮る。3人以上で「試す英文を選ぶ」画面が出るため、それが写る最小の人数にする。
 *
 * ホストをレベル1にするのは、候補の日本語の補足が開いた状態（レベル1〜2）を候補の確認で写すためである。
 * 規則の絞り方はE2Eと共用する（e2e/support/secretrule.ts）。
 */
const SECRET_RULE_LEVELS = [1, 3, 5, 2];

test("SECRET RULE ENGLISH", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, SECRET_RULE_LEVELS, { testTitle: "secretrule" });
  try {
    const pages = table.pages;
    const host = pages[0]!;
    await startWith(host, "SECRET RULE ENGLISH", "はじめての規則");

    // briefing: 遊び方、語の数え方、候補6件（レベル1なので日本語つき）
    await waitForStage(pages, "候補の確認");
    const candidates = await readCandidates(host);
    await shoot(host, "secretrule-briefing");
    for (const page of pages) {
      await page.click("[data-testid='ready']");
    }

    let consistent = [...candidates.keys()];
    const used = new Set<string>();
    for (let round = 1; round <= 4; round += 1) {
      await waitForStage(pages, `下書き ${round} / 4`);
      const [first, second] = pickTests(consistent, used);
      used.add(first);
      used.add(second);

      if (round === 1) {
        // 下書き: 入力欄に書いた状態を撮る
        await host.fill("[data-testid='submission-input']", first);
        await host.locator("[data-testid='submission-input']").evaluate((element) =>
          element.scrollIntoView({ block: "center" }),
        );
        await shoot(host, "secretrule-writing");
      }
      await submitText(pages[0]!, first);
      await submitText(pages[1]!, second);
      for (const page of pages.slice(2)) {
        const filler = BANK.find((text) => !used.has(text))!;
        used.add(filler);
        await submitText(page, filler);
      }

      await waitForStage(pages, "試す英文を選ぶ");
      for (const page of pages) {
        for (const text of [first, second]) {
          await page.locator("[data-testid='draft']").filter({ hasText: text }).locator("[data-testid='mark-draft']").click();
        }
      }
      for (const page of pages) {
        await expect(page.locator("[data-testid='draft'].marked")).toHaveCount(2);
      }
      if (round === 1) {
        await shoot(pages[2]!, "secretrule-choosing");
      }
      for (const page of pages) {
        await page.click("[data-testid='ready']");
      }

      await waitForStage(pages, "報告と回答");
      if (round === 1) {
        // 試した英文の作者の画面。自分の英文の成否だけが出ている
        await shoot(host, "secretrule-checking-author");
      }
      consistent = consistentCandidates(consistent, await collectVerdicts(pages));
      if (consistent.length === 1) {
        for (const page of pages) {
          await page
            .locator(`[data-testid='candidate'][data-candidate-id='${consistent[0]}'] [data-testid='select-candidate']`)
            .click();
        }
        // 判定にかからなかった人の画面。候補を選んだ顔と、揃っている表示が写る位置まで送る
        const listener = pages[2]!;
        await expect(listener.locator("[data-testid='answer-status']")).toContainText("揃っています");
        // 上端に固定のタイマーバーがあるため、説明文が隠れないよう、送った後に少し戻す
        await listener.locator("[data-testid='answer-timing']").evaluate((element) => {
          element.scrollIntoView({ block: "start" });
          window.scrollBy(0, -80);
        });
        await shoot(listener, "secretrule-checking-listener");
        for (const page of pages) {
          await page.click("[data-testid='ready']");
        }
        break;
      }
      for (const page of pages) {
        await page.click("[data-testid='ready']");
      }
    }

    // proving: 正解の規則と避ける候補、入力欄に書いた状態。
    // 全員が通る英文を出し、結果の画面に正しく遊んだときのランクが写るようにする
    await waitForStage(pages, "規則を使って書く");
    const avoidText = ((await host.locator("[data-testid='proving-target'] .en").nth(1).textContent()) ?? "").trim();
    const avoid = [...candidates].find(([, text]) => text === avoidText)?.[0];
    const rule = consistent[0]!;
    const passing = BANK.filter(
      (text) => !used.has(text) && PREDICATES[rule]!(text) && avoid !== undefined && !PREDICATES[avoid]!(text),
    );
    const unused = [...passing, ...BANK.filter((text) => !used.has(text) && !passing.includes(text))];
    await host.fill("[data-testid='submission-input']", unused[0]!);
    await shoot(host, "secretrule-proving");
    for (const [index, page] of pages.entries()) {
      await submitText(page, unused[index]!);
    }

    // debrief: 成否とランク、秘密の規則、全ラウンドの英文
    await expect(host.locator("[data-testid='outcome']")).toBeVisible({ timeout: 30_000 });
    await shoot(host, "secretrule-debrief");
  } finally {
    await table.close();
  }
});

/**
 * MIND MELDは4人（2ペア）で撮る。
 *
 * 撮りたい画面（一致・近い語の申告と異議・前の2語・そろったペアの待ち）は2ペアで全部出る。
 * 4人では判定者が相手ペアの2人だけになり、1人の異議では退けられない（15の「近い語の申告と異議」）ため、
 * 申告が認められてラウンドが進み、撮影の手順が分岐しない。
 * ホストをレベル1にするのは、お題の日本語が開いた状態を語を出す画面で写すためである。
 */
const MIND_MELD_LEVELS = [1, 3, 4, 2];

/**
 * 撮影で出す語。お題の英文の語と開示済みの語は出せない（15の「使用済みの語」）ため、
 * 出せるものを先頭から選び、選んだ語は在庫から外す（同じゲームで二度出さない）。
 * お題はseedで決まり指定できないため、どのお題でも語として読める一般の名詞にしてある。
 */
const MIND_MELD_WORDS = [
  "water",
  "music",
  "coffee",
  "family",
  "summer",
  "garden",
  "friend",
  "window",
  "pizza",
  "river",
  "school",
  "money",
  "paper",
  "dream",
  "train",
  "sugar",
  "doctor",
  "forest",
  "camera",
  "island",
];

/** 近い語の組。照合キーは一致しないが申告できる（15の「近い語」の条件を満たす） */
const MIND_MELD_NEAR = [
  ["apple", "apples"],
  ["color", "colour"],
  ["tomato", "tomatoes"],
];

/** 入力欄に語を書き、送信ボタンが押せるか（表示形の条件と使用済みの語をクライアントが確かめる） */
async function canSendWord(page: Page, word: string): Promise<boolean> {
  await page.fill("[data-testid='word-input']", word);
  await page.waitForTimeout(100);
  return page.locator("[data-testid='submit-word']").isEnabled();
}

/** 在庫から出せる語を1つ選んで在庫から外す。入力欄には選んだ語が書かれたまま残る */
async function takeWord(page: Page, stock: string[]): Promise<string> {
  for (const [index, word] of stock.entries()) {
    if (await canSendWord(page, word)) {
      stock.splice(index, 1);
      return word;
    }
  }
  throw new Error("出せる語が在庫にない");
}

test("MIND MELD", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, MIND_MELD_LEVELS, { testTitle: "mindmeld" });
  try {
    const pages = table.pages;
    const host = pages[0]!;
    await startWith(host, "MIND MELD", "はじめてのお題");

    // briefing: チームの一覧、申告の基準、口頭の約束
    await mindmeld.waitForStage(pages, "遊び方の確認");
    const teamOfPage = await Promise.all(pages.map((page) => mindmeld.readMyTeam(page)));
    await shoot(host, "mindmeld-briefing");
    await mindmeld.clickReady(pages);

    const hostTeam = teamOfPage[0]!;
    const otherTeam = teamOfPage.find((teamId) => teamId !== hostTeam)!;
    const membersOf = (teamId: string) => pages.filter((_, index) => teamOfPage[index] === teamId);
    const [hostSelf, hostPartner] = membersOf(hostTeam) as [Page, Page];
    const [nearFirst, nearSecond] = membersOf(otherTeam) as [Page, Page];
    const stock = [...MIND_MELD_WORDS];
    const ready = async () => {
      for (const page of pages) {
        await mindmeld.isActive(page);
      }
    };

    // お題1・1回目: ホストのペアはそろえ、もう一方のペアは近い語を出して申告する
    await mindmeld.waitForStage(pages, "語を出す お題1/4・1回目");
    await ready();
    const first = await takeWord(hostSelf, stock);
    // 語を出す画面。お題と、入力欄に語を書いた状態
    await shoot(hostSelf, "mindmeld-input");
    await mindmeld.submitWord(hostSelf, first);
    await mindmeld.submitWord(hostPartner, first);
    let near: string[] | undefined;
    for (const pair of MIND_MELD_NEAR) {
      if ((await canSendWord(nearFirst, pair[0]!)) && (await canSendWord(nearSecond, pair[1]!))) {
        near = pair;
        break;
      }
    }
    if (near === undefined) {
      throw new Error("出せる近い語の組がない");
    }
    await mindmeld.submitWord(nearFirst, near[0]!);
    await mindmeld.submitWord(nearSecond, near[1]!);

    // reveal: カウントダウンが消えて全ペアの語が出てから撮る。申告する側の画面（申告のボタンが出ている）
    await mindmeld.waitForReveal(pages);
    await shoot(nearFirst, "mindmeld-reveal");
    await nearFirst.click("[data-testid='claim']");
    // 判定する側が異議を出した後の画面。異議の数と「このままなら認められる」が出る
    const claimRow = hostSelf.locator(`[data-testid='reveal-row'][data-team-id='${otherTeam}']`);
    await claimRow.locator("[data-testid='object']").click();
    await expect(claimRow.locator("[data-testid='objectors'] .face")).toHaveCount(1, { timeout: 10_000 });
    await shoot(hostSelf, "mindmeld-reveal-claim");
    await mindmeld.clickReady(pages);

    // お題2・1回目: ホストのペアはそろわず、もう一方のペアはそろう
    await mindmeld.waitForStage(pages, "語を出す お題2/4・1回目");
    await ready();
    await mindmeld.submitWord(hostSelf, await takeWord(hostSelf, stock));
    await mindmeld.submitWord(hostPartner, await takeWord(hostPartner, stock));
    const matched = await takeWord(nearFirst, stock);
    await mindmeld.submitWord(nearFirst, matched);
    await mindmeld.submitWord(nearSecond, matched);
    await mindmeld.waitForReveal(pages);
    await mindmeld.clickReady(pages);

    // お題2・2回目: ホストのペアには前の2語が出て、そろったペアは待つ
    await mindmeld.waitForStage(pages, "語を出す お題2/4・2回目");
    await ready();
    const linked = await takeWord(hostSelf, stock);
    await shoot(hostSelf, "mindmeld-input-previous");
    await shoot(nearFirst, "mindmeld-input-waiting");
    await mindmeld.submitWord(hostSelf, linked);
    await mindmeld.submitWord(hostPartner, linked);
    await mindmeld.waitForReveal(pages);
    await mindmeld.clickReady(pages);

    // お題3・4: 両ペアとも1回目でそろえて結果へ進む
    for (const round of [3, 4]) {
      await mindmeld.waitForStage(pages, `語を出す お題${round}/4・1回目`);
      await ready();
      for (const [self, partner] of [
        [hostSelf, hostPartner],
        [nearFirst, nearSecond],
      ] as const) {
        const word = await takeWord(self, stock);
        await mindmeld.submitWord(self, word);
        await mindmeld.submitWord(partner, word);
      }
      await mindmeld.waitForReveal(pages);
      await mindmeld.clickReady(pages);
    }

    // debrief: ペアの順位と点、お題ごとの語の流れ
    await mindmeld.waitForStage(pages, "結果");
    await expect(host.locator("[data-testid='standing']")).toHaveCount(2, { timeout: 30_000 });
    await shoot(host, "mindmeld-debrief");
  } finally {
    await table.close();
  }
});

/**
 * TWO-HEADED SPEAKERは6人（3ペア）で撮る。対応人数の下限であり、説明役のペア・当てる側の2ペアがそろう。
 * 「だれが当てた？」のシートに当てる側のペアが複数並ぶのも、3ペアからである。
 *
 * 周回数は既定（2周）のまま撮る。1手番は消費上限（5枚）まで正解と送りを申告して終える（E2Eと同じ進め方）。
 */
const TWO_HEADED_LEVELS = [5, 4, 3, 3, 2, 1];

test("TWO-HEADED SPEAKER", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, TWO_HEADED_LEVELS, { testTitle: "twoheaded" });
  try {
    const pages = table.pages;
    const host = pages[0]!;
    await startWith(host, "TWO-HEADED SPEAKER", "Everyday Things");

    // briefing: ペアの一覧と説明の順、交互の違反と言えない語の規則
    await twoheaded.waitForStage(pages, "遊び方の確認");
    const teamOfPage = await Promise.all(pages.map((page) => twoheaded.readMyTeam(page)));
    const teamIds = await twoheaded.readTeamOrder(host);
    await shoot(host, "twoheaded-briefing");
    await twoheaded.readyAll(pages);

    const turns = teamIds.length * 2;
    for (let turn = 0; turn < turns; turn += 1) {
      await twoheaded.waitForStage(pages, `交代 ${turn + 1} / ${turns}`);
      const explainerTeamId = teamIds[turn % teamIds.length]!;
      const explainers = pages.filter((_, index) => teamOfPage[index] === explainerTeamId);
      const guessers = pages.filter((page) => !explainers.includes(page));
      const others = teamIds.filter((teamId) => teamId !== explainerTeamId);
      // レベルの低い方の説明役で撮る。書き出しの例が開いた状態（レベル1〜2）が写る
      const opener = explainers.reduce((low, page) =>
        TWO_HEADED_LEVELS[pages.indexOf(page)]! < TWO_HEADED_LEVELS[pages.indexOf(low)]! ? page : low,
      );

      if (turn === 0) {
        // handoff: 説明役だけに伏せ面が出る。開く前と開いた後、当てる側の画面を撮る
        await expect(opener.locator("[data-testid='explainer-cover']")).toBeVisible({ timeout: 10_000 });
        await shoot(opener, "twoheaded-handoff-cover");
        await shoot(guessers[0]!, "twoheaded-handoff-guesser");
      }
      await twoheaded.openCutIn(opener);
      if (turn === 0) {
        await shoot(opener, "twoheaded-handoff-card");
      }
      await opener.click("[data-testid='start-turn']");
      await twoheaded.waitForStage(pages, "説明タイム");

      for (let card = 0; card < 5; card += 1) {
        const operator = turn === 0 && card === 0 ? opener : explainers[card % explainers.length]!;
        const answer = await twoheaded.readAnswer(operator);
        if (turn === 0 && card === 0) {
          // explaining: 説明役の画面（お題・言えない語・話す順・書き出しの例）と、「正解」のシート
          await shoot(operator, "twoheaded-explaining-explainer");
          await operator.click("[data-testid='claim-open']");
          await expect(operator.locator("[data-testid='claim-sheet']")).toBeVisible({ timeout: 10_000 });
          await shoot(operator, "twoheaded-claim-sheet");
          await operator.click(`[data-testid='claim-sheet'] [data-testid='claim-team'][data-team-id='${others[0]}']`);
          await expect(operator.locator("[data-testid='claim-sheet']")).toHaveCount(0, { timeout: 10_000 });
          // 当てる側の画面。終えたお題の答えと、当てたペアが出る
          await expect(guessers[0]!.locator("[data-testid='last-card']")).toBeVisible({ timeout: 10_000 });
          await shoot(guessers[0]!, "twoheaded-explaining-guesser");
        } else if (card % 2 === 0) {
          // 当てたペアは毎回、当てる側の先頭のペアにする。E2Eのように順に散らすと全ペアが同点になり、
          // 結果の画面に順位の差が写らない（実測で DRAW! を撮った）
          await twoheaded.claimCorrect(operator, others[0]!);
        } else {
          await operator.click("[data-testid='pass-card']");
        }
        // 申告の受理を待ってから次のお題を読む。待たないと申告する前のお題を読み、同じお題へ二度申告する。
        // 受理は当てる側の画面の「直前のお題」で確かめる（E2Eと同じ確かめ方）。5枚目は次の交代を待つ
        if (card < 4) {
          await expect(guessers[0]!.locator("[data-testid='last-card']")).toContainText(answer, { timeout: 10_000 });
        }
      }
    }

    // debrief: ペアの順位と点、使ったお題と結果
    await twoheaded.waitForStage(pages, "結果");
    await expect(host.locator("[data-testid='standing']")).toHaveCount(teamIds.length, { timeout: 30_000 });
    await shoot(host, "twoheaded-debrief");
  } finally {
    await table.close();
  }
});

/**
 * SECRET TEAMSは6人（3対3）で撮る。
 *
 * 4人（2対2）では選べる味方が1人だけになり、味方を複数選ぶ回答の画面が写らない。
 * 6人なら味方を2人まで選べ、人数構成も「3人 対 3人」で揃う（奇数人数の差し引きの説明が要らない）。
 * ホストをレベル1にするのは、単語とテーマ・選択肢の日本語が開いた状態を写すためである。
 */
const SECRET_TEAMS_LEVELS = [1, 3, 5, 2, 4, 3];

test("SECRET TEAMS", async ({ browser, baseURL }) => {
  const table = await openTable(browser, baseURL!, SECRET_TEAMS_LEVELS, { testTitle: "secretteams" });
  try {
    const pages = table.pages;
    const host = pages[0]!;
    await startWith(host, "SECRET TEAMS", "はじめてのテーマ");

    // briefing: 単語とテーマの伏せ面 → カットイン → 閉じた後の本体
    await secretteams.waitForStage(pages, "遊び方の確認");
    await expect(host.locator("[data-testid='word-cover']")).toBeVisible({ timeout: 20_000 });
    await shoot(host, "secretteams-word-cover");
    await host.click("[data-testid='word-cover']");
    await expect(host.locator("[data-testid='word-card']")).toBeVisible({ timeout: 10_000 });
    await shoot(host, "secretteams-word-card");
    await host.click("[data-testid='word-confirm']");
    const seats = [await secretteams.readSeat(host)];
    await shoot(host, "secretteams-briefing");
    for (const page of pages.slice(1)) {
      seats.push(await secretteams.openSeat(page));
    }
    await secretteams.clickReady(pages);

    // clue: 手番の人の画面と、聞いている人の画面。最初の手番で撮り、あとは説明を終えて進める
    const totalTurns = seats.length * 2;
    for (let turnIndex = 0; turnIndex < totalTurns; turnIndex += 1) {
      const speakerId = await secretteams.waitForTurn(host, turnIndex);
      const speaker = seats.find((seat) => seat.playerId === speakerId)!;
      if (turnIndex === 0) {
        await expect(speaker.page.locator("[data-testid='done']")).toBeVisible({ timeout: 10_000 });
        // briefing の「読んだ」を押した位置（画面の下の方）のまま残るため、上端へ戻してから撮る。
        // 戻さないと「いま説明している人」と自分の番までの人数が写らない（実測）
        await speaker.page.evaluate(() => window.scrollTo(0, 0));
        await shoot(speaker.page, "secretteams-clue-speaker");
        // 聞く側はホスト（レベル1で言い回しが開いている）。ホストが手番なら次の人
        const listener = speaker.page === host ? pages[1]! : host;
        await listener.evaluate(() => window.scrollTo(0, 0));
        await shoot(listener, "secretteams-clue-listener");
      }
      await speaker.page.click("[data-testid='done']");
    }

    // answering: ホストが味方と相手のテーマを選んだ状態を撮る。
    // ホストのチームは全員が正しく答え、相手のチームは1人だけテーマを外す（結果に勝敗が付く）
    await secretteams.waitForStage(pages, "回答");
    const hostSeat = seats[0]!;
    const opponentThemeId = seats.find((seat) => seat.themeId !== hostSeat.themeId)!.themeId;
    const otherThemeId = await host
      .locator("[data-testid='theme-option']")
      .evaluateAll(
        (nodes, used) => nodes.map((node) => node.getAttribute("data-theme-id") ?? "").find((id) => !used.includes(id)) ?? "",
        [hostSeat.themeId, opponentThemeId],
      );
    const alliesOf = (seat: secretteams.Seat) =>
      seats.filter((other) => other !== seat && other.themeId === seat.themeId).map((other) => other.playerId);

    for (const allyId of alliesOf(hostSeat)) {
      await host.click(`[data-testid='ally-option'][data-player-id='${allyId}']`);
    }
    await host.click(`[data-testid='theme-option'][data-theme-id='${opponentThemeId}']`);
    // 味方の選択肢から相手のテーマ・送信ボタンまでが1画面に入る位置へ送る。
    // 上端に固定のタイマーバーがあり、選択肢の見出しが隠れるため、送った後に戻す（実測で見出しが隠れた）
    await host.locator("[data-testid='ally-option']").first().evaluate((element) => {
      element.scrollIntoView({ block: "start" });
      window.scrollBy(0, -140);
    });
    await shoot(host, "secretteams-answering");
    await host.click("[data-testid='submit-answer']");
    await expect(host.locator("[data-testid='submitted-hint']")).toBeVisible({ timeout: 10_000 });

    let missed = false;
    for (const seat of seats.slice(1)) {
      const enemyTheme = seats.find((other) => other.themeId !== seat.themeId)!.themeId;
      const wrongOnce: boolean = seat.themeId === opponentThemeId && !missed;
      missed ||= wrongOnce;
      await secretteams.submitAnswer(seat.page, alliesOf(seat), wrongOnce ? otherThemeId : enemyTheme);
    }

    // reveal: 勝敗と両チームの得点、チームごとのテーマとメンバーと単語
    await secretteams.waitForStage(pages, "結果");
    await expect(host.locator("[data-testid='team-result']")).toHaveCount(2, { timeout: 30_000 });
    await shoot(host, "secretteams-reveal");
  } finally {
    await table.close();
  }
});
