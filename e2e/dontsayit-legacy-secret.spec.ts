// 旧版で保存された秘密情報が新しい画面へ届く経路の検証。
//
// 再接続ではサーバが保存済みの秘密情報をそのまま返す
// （`server/core/src/room-do.ts` の `reconnectPlayer` は `secrets.playerSecrets` を無加工で送る）。
// 秘密情報が作り直されるのはカードが進んだときだけなので、デプロイをまたいだ部屋では
// `ja` と `aliases` を持たない payload が新しい画面へ届く。
// 部屋の有効期限は最終アクセスから2時間（`ROOM_EXPIRE_MS`）であり、遊んでいる最中にデプロイすれば当たる。
//
// 画面は `aliases.length` を直接読むため、補わないと描画時に例外になる（実測で3箇所）。
// このテストは WebSocket を仲介して `secret` の payload から `ja` と `aliases` を落とし、
// 旧形式そのものを画面へ流し込む。
import { expect, test, type Page } from "@playwright/test";
import { openTable } from "./support/room";

const GAME_TITLE = "DON'T SAY IT";
const SET_TITLE = "Famous Figures";

/** 旧形式にするため secret の payload から ja と aliases を落とす */
function stripNewFields(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const message = parsed as { type?: unknown; payload?: Record<string, unknown> };
  if (message.type !== "secret" || typeof message.payload !== "object" || message.payload === null) {
    return raw;
  }
  const payload = message.payload;
  // 説明者: card の下に ja / aliases がある
  const card = payload["card"];
  if (typeof card === "object" && card !== null) {
    delete (card as Record<string, unknown>)["ja"];
    delete (card as Record<string, unknown>)["aliases"];
  }
  // 監視役: payload 直下に ja / aliases がある
  delete payload["ja"];
  delete payload["aliases"];
  return JSON.stringify(parsed);
}

async function findPageBy(pages: Page[], selector: string, timeoutMs = 10_000): Promise<Page> {
  const started = Date.now();
  for (;;) {
    for (const page of pages) {
      if (await page.locator(selector).first().isVisible()) {
        return page;
      }
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`該当する端末がない: ${selector}`);
    }
    await pages[0]!.waitForTimeout(200);
  }
}

test("旧形式の秘密情報（ja と aliases が無い）でも説明者と監視役の画面が描ける", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);

  const pageErrors: string[] = [];

  const table = await openTable(browser, baseURL!, [5, 4, 3, 3, 2, 1], {
    testTitle: test.info().title,
    prepare: async (page) => {
      // 描画時の例外は throw されずコンソールへ出るため、ここで拾って最後に検査する
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });
      await page.routeWebSocket(/\/room\/.*\/ws/, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => server.send(message));
        server.onMessage((message) => {
          ws.send(typeof message === "string" ? stripNewFields(message) : message);
        });
      });
    },
  });

  try {
    const host = table.pages[0]!;
    await host.click(`.title-card:has-text("${GAME_TITLE}")`);
    await host.click(`.content-chip:has-text("${SET_TITLE}")`);
    await host.click(".beb-btn:has-text('ゲームスタート')");

    for (const page of table.pages) {
      await expect(page.locator(".roles")).toBeVisible({ timeout: 15_000 });
      await page.click(".beb-btn:has-text('準備できた')");
    }

    // 交代。説明者のカットインが旧形式の秘密情報で開くかを見る。
    // ここが aliases.length を読む箇所である（SpeakerCutIn.svelte）
    const speaker = await findPageBy(table.pages, "[data-testid='speaker-cover']", 15_000);
    await speaker.click("[data-testid='speaker-cover']");
    await expect(speaker.locator("[data-testid='speaker-card']")).toBeVisible({ timeout: 10_000 });
    // ja が無いので日本語名の行は出ない
    await expect(speaker.locator("[data-testid='answer-ja']")).toHaveText("");
    // aliases が無いので別名の一覧は出ない
    await expect(speaker.locator("[data-testid='speaker-aliases']")).toHaveCount(0);

    await speaker.click(".beb-btn:has-text('はじめる')");

    // 説明タイム。説明者と監視役の両方が aliases.length を読む（Explaining.svelte）
    await expect(speaker.locator("[data-testid='answer']")).toBeVisible({ timeout: 10_000 });
    await expect(speaker.locator(".taboo li").first()).toBeVisible();
    await expect(speaker.locator("[data-testid='speaker-aliases']")).toHaveCount(0);

    const watcher = await findPageBy(table.pages, "[data-testid='watched-answer']", 15_000);
    await expect(watcher.locator(".beb-btn:has-text('違反')")).toBeVisible();
    await expect(watcher.locator("[data-testid='watched-answer-ja']")).toHaveText("");
    await expect(watcher.locator("[data-testid='watcher-aliases']")).toHaveCount(0);

    // 描画時に例外が出ていないこと。補う前はここで aliases の読み取りが落ちる
    expect(pageErrors).toEqual([]);
  } finally {
    await table.close();
  }
});
