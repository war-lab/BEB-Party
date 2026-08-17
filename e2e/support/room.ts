// E2E共通の導線ヘルパー。部屋作成から捜査開始までを組み立てる
import { expect, type Browser, type Page } from "@playwright/test";

/**
 * テストごとに異なる `CF-Connecting-IP` を割り当てるためのヘッダを返す。
 *
 * `POST /api/rooms` はIPごとに5回/60秒に制限されている（基本設計/01のレート制限）。
 * 全テストが同じ127.0.0.1から部屋を作ると、5部屋目以降が429で弾かれてテストが落ちる。
 * 実運用では会場ごとにIPが異なるため、テストでも1テスト=1IPとして扱う。
 * 制限そのものは緩めない（同一テスト内の6人は同じIPを共有し、WS側の制限は実測どおりに掛かる）。
 */
export function clientIpHeaders(testTitle: string): { "CF-Connecting-IP": string } {
  let hash = 0;
  for (const char of testTitle) {
    hash = (hash * 31 + char.charCodeAt(0)) % 16_777_216;
  }
  const a = 10;
  const b = (hash >> 16) & 0xff;
  const c = (hash >> 8) & 0xff;
  const d = (hash & 0xff) || 1;
  return { "CF-Connecting-IP": `${a}.${b}.${c}.${d}` };
}

export interface Table {
  pages: Page[];
  code: string;
  close: () => Promise<void>;
}

/** stateメッセージを記録する。秘密の非混入をブラウザ側で確認するために使う */
export async function recordStateMessages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const received: string[] = [];
    (window as unknown as { __states: string[] }).__states = received;
    const Original = window.WebSocket;
    class Recording extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", (event: MessageEvent) => {
          if (typeof event.data === "string" && event.data.includes('"type":"state"')) {
            received.push(event.data);
          }
        });
      }
    }
    window.WebSocket = Recording as unknown as typeof WebSocket;
  });
}

export async function readStateMessages(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __states: string[] }).__states ?? []);
}

/** 人数分のコンテキストを開き、部屋を作って全員を参加させる */
export async function openTable(
  browser: Browser,
  baseURL: string,
  levels: number[],
  options: {
    record?: boolean;
    prepare?: (page: Page, index: number) => Promise<void>;
    testTitle?: string;
  } = {},
): Promise<Table> {
  const extraHTTPHeaders = clientIpHeaders(options.testTitle ?? "default");
  const contexts = await Promise.all(levels.map(() => browser.newContext({ extraHTTPHeaders })));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));

  if (options.record) {
    await Promise.all(pages.map((page) => recordStateMessages(page)));
  }
  if (options.prepare) {
    // gotoより前に呼ぶ。WebSocketのルーティング等、初回接続前に仕込む必要があるものに使う
    await Promise.all(pages.map((page, index) => options.prepare!(page, index)));
  }

  const host = pages[0]!;
  await host.goto(baseURL);
  await host.fill('input[placeholder="なまえ"]', "Player1");
  await host.selectOption("select", String(levels[0]));
  await host.click("button.primary");
  await host.waitForSelector("h1:has-text('部屋 ')");
  const code = ((await host.locator("h1").textContent()) ?? "").replace("部屋 ", "").trim();

  for (let index = 1; index < pages.length; index += 1) {
    const page = pages[index]!;
    await page.goto(baseURL);
    await page.fill('input[placeholder="なまえ"]', `Player${index + 1}`);
    await page.selectOption("select", String(levels[index]));
    await page.fill('input[placeholder="部屋コード"]', code);
    await page.click("text=参加する");
    await page.waitForSelector("h1:has-text('部屋 ')");
  }

  for (const page of pages) {
    await expect(page.locator(".participants .tile")).toHaveCount(levels.length, { timeout: 10_000 });
  }

  return {
    pages,
    code,
    close: async () => {
      await Promise.all(contexts.map((context) => context.close()));
    },
  };
}

/** ホストがゲームと事件を選び、開始する */
export async function startGame(host: Page): Promise<void> {
  await host.click("text=ENGLISH DETECTIVES");
  await host.click("text=The Missing Laptop");
  await host.click("button.primary:has-text('はじめる')");
}

/** 全員が配役カットインを開いて準備完了を送る */
export async function readyAll(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.waitForSelector("[data-testid='role-cover']");
    await page.click("[data-testid='role-cover']");
    await page.click("text=確認した");
    await page.click("text=準備できた");
  }
}

/**
 * 全員が誰かに投票する（自分以外の先頭の容疑者）。
 *
 * 最後の1人が投票した時点でrevealへ遷移するため、投票後の表示は
 * 「投票済み」か「結果」のどちらかになる。
 */
export async function voteAll(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.waitForSelector("button.suspect");
    await page.locator("button.suspect").first().click();
    await page.click("text=この人にする");
    await expect(page.locator("[data-testid='vote-done'], [data-testid='outcome']").first()).toBeVisible();
  }
}
