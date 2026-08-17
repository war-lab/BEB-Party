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

/** ホーム画面でなまえとレベルを入れる（レベルはチップ選択） */
async function fillIdentity(page: Page, name: string, level: number): Promise<void> {
  await page.fill('input[placeholder="なまえ"]', name);
  await page.click(`.level-chip:has-text("Lv.${level}")`);
}

/** 部屋を作ってロビーへ入る */
export async function createRoom(page: Page, baseURL: string, name: string, level: number): Promise<void> {
  await page.goto(baseURL);
  await fillIdentity(page, name, level);
  await page.click("text=部屋を作る");
  await page.waitForSelector(".room-chip .code");
}

/** 部屋コードで参加する */
export async function joinRoom(
  page: Page,
  baseURL: string,
  name: string,
  level: number,
  code: string,
): Promise<void> {
  await page.goto(baseURL);
  await fillIdentity(page, name, level);
  await page.click("text=部屋に参加する");
  await page.fill('input[placeholder="部屋コード"]', code);
  await page.click("text=参加する");
  await page.waitForSelector(".room-chip .code");
}

/** ロビーに表示されている部屋コードを読む */
export async function readRoomCode(page: Page): Promise<string> {
  return ((await page.locator(".room-chip .code").textContent()) ?? "").trim();
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
  await createRoom(host, baseURL, "Player1", levels[0]!);
  const code = await readRoomCode(host);

  for (let index = 1; index < pages.length; index += 1) {
    await joinRoom(pages[index]!, baseURL, `Player${index + 1}`, levels[index]!, code);
  }

  for (const page of pages) {
    await expect(page.locator(".roster .beb-tile:not(.empty)")).toHaveCount(levels.length, { timeout: 10_000 });
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
  await host.click(".title-card:has-text('ENGLISH DETECTIVES')");
  await host.click(".content-chip:has-text('The Missing Laptop')");
  await host.click(".beb-btn:has-text('ゲームスタート')");
}

/**
 * 全員が配役カットインを開いて準備完了を送る。
 *
 * 送信が受理されたことを画面で確かめてから次の人へ進む。
 * 最後の1人が送った時点で捜査へ遷移するため、待つ対象は「ボタンの無効化」か「捜査のタイマー」のどちらかになる。
 */
export async function readyAll(pages: Page[]): Promise<void> {
  for (const page of pages) {
    await page.waitForSelector("[data-testid='role-cover']");
    await page.click("[data-testid='role-cover']");
    await page.click(".beb-btn:has-text('確認した')");
    await page.click(".beb-btn:has-text('準備できた')");
    await expect(
      page
        .locator(".beb-btn:has-text('他の人を待っています'), [data-testid='stage-timer']:has-text('捜査フェーズ')")
        .first(),
    ).toBeVisible({ timeout: 10_000 });
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
    await page.click("text=この人に投票する");
    await expect(page.locator("[data-testid='vote-done'], [data-testid='outcome']").first()).toBeVisible();
  }
}
