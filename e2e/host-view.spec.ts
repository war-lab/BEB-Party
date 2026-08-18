// ホスト画面（`/room/:code?mode=host`）の通し確認（基本設計/02の表示モード）
// - 観戦ソケットとして入り、参加者に数えられない
// - ステージ名・タイマー・参加者が出て、入力系UIが無い
// - secretが届かない
// - タイマーが実際に減る（サーバ時刻の補正で止まらないこと）
import { test, expect, type Page } from "@playwright/test";
import { clientIpHeaders, openTable, readyAll, startGame } from "./support/room";

/** WebSocketで受けたメッセージのtypeを記録する。secretの非受信を確かめるために使う */
async function recordMessageTypes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const received: string[] = [];
    (window as unknown as { __types: string[] }).__types = received;
    const Original = window.WebSocket;
    class Recording extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", (event: MessageEvent) => {
          if (typeof event.data !== "string") {
            return;
          }
          const match = /"type":"([a-z]+)"/.exec(event.data);
          if (match?.[1]) {
            received.push(match[1]);
          }
        });
      }
    }
    window.WebSocket = Recording as unknown as typeof WebSocket;
  });
}

function toSeconds(text: string): number {
  const [minutes, seconds] = text.trim().split(":").map(Number);
  return (minutes ?? 0) * 60 + (seconds ?? 0);
}

test("ホスト画面はステージ名・タイマー・参加者だけを出し、secretを受け取らない", async ({ browser, baseURL }) => {
  test.slow();
  const table = await openTable(browser, baseURL!, [5, 4, 3, 2, 1], { testTitle: test.info().title });

  // 参加者と同じIPから開く。WebSocketのレート制限を実運用どおりに掛けたまま検証する
  const hostContext = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(test.info().title) });
  const hostScreen = await hostContext.newPage();

  try {
    await recordMessageTypes(hostScreen);
    await hostScreen.goto(`${baseURL}/room/${table.code}?mode=host`);

    // ロビー中は待機表示。参加者は5人とも出る
    await expect(hostScreen.locator("[data-testid='host-stage']")).toHaveText("参加者を待っています", {
      timeout: 10_000,
    });
    await expect(hostScreen.locator(".roster .tile")).toHaveCount(5);

    // 観戦ソケットは参加者に数えない（参加者側のロスターは5人のまま）
    await expect(table.pages[0]!.locator(".roster .beb-tile:not(.empty)")).toHaveCount(5);

    // 入力系UIを出さない（読み取り専用モード）
    await expect(hostScreen.locator("button, input, a")).toHaveCount(0);

    // HOSTバッジがタイルの装飾に収まっている。
    // ルート要素とクラス名が衝突すると画面全体を覆う帯になり、テキスト検査では気付けない
    const badge = hostScreen.locator(".roster .badge").first();
    await expect(badge).toBeVisible();
    const box = await badge.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(100);

    await startGame(table.pages[0]!);
    await expect(hostScreen.locator("[data-testid='host-stage']")).toHaveText("ブリーフィング", { timeout: 10_000 });

    await readyAll(table.pages);
    await expect(hostScreen.locator("[data-testid='host-stage']")).toHaveText("捜査フェーズ", { timeout: 10_000 });

    // タイマーが減る。補正の掛け違いで止まると、この差が0のままになる
    const first = toSeconds((await hostScreen.locator("[data-testid='host-timer']").textContent()) ?? "");
    const playerFirst = toSeconds((await table.pages[0]!.locator("[data-testid='stage-timer'] .t").textContent()) ?? "");
    await hostScreen.waitForTimeout(3_000);
    const second = toSeconds((await hostScreen.locator("[data-testid='host-timer']").textContent()) ?? "");
    const playerSecond = toSeconds(
      (await table.pages[0]!.locator("[data-testid='stage-timer'] .t").textContent()) ?? "",
    );
    expect(second).toBeLessThan(first);
    expect(playerSecond).toBeLessThan(playerFirst);

    // 秘密はホスト画面へ配らない（基本設計/01の観戦ソケット）
    const types = await hostScreen.evaluate(() => (window as unknown as { __types: string[] }).__types ?? []);
    expect(types).toContain("state");
    expect(types).not.toContain("secret");
    expect(types).not.toContain("joined");
  } finally {
    await hostContext.close();
    await table.close();
  }
});

test("部屋コードを含まない ?mode=host は通常のホーム導線になり、ホスト画面を出さない", async ({ browser, baseURL }) => {
  // ホスト画面は観戦ソケットで入ることが前提。ホームからのjoinでホスト画面を描くと、
  // 投影用の画面が参加者の席を占有したまま操作できない状態になる
  const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(test.info().title) });
  const page = await context.newPage();

  try {
    await page.goto(`${baseURL}/?mode=host`);
    await expect(page.locator('input[placeholder="なまえ"]')).toBeVisible();

    await page.fill('input[placeholder="なまえ"]', "Player1");
    await page.click('.level-chip:has-text("Lv.3")');
    await page.click("text=部屋を作る");
    await page.waitForSelector(".room-chip .code");

    await expect(page.locator("[data-testid='host-view']")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("3枚目のホスト画面はspectator_limitで理由を出し、再接続を繰り返さない", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(test.info().title) });
  const owner = await context.newPage();

  try {
    // 部屋を作る（ホーム経由）
    await owner.goto(baseURL!);
    await owner.fill('input[placeholder="なまえ"]', "Player1");
    await owner.click('.level-chip:has-text("Lv.3")');
    await owner.click("text=部屋を作る");
    await owner.waitForSelector(".room-chip .code");
    const code = ((await owner.locator(".room-chip .code").textContent()) ?? "").trim();

    const screens = [];
    for (let index = 0; index < 2; index += 1) {
      const page = await context.newPage();
      await page.goto(`${baseURL}/room/${code}?mode=host`);
      await expect(page.locator("[data-testid='host-stage']")).toBeVisible({ timeout: 10_000 });
      screens.push(page);
    }

    const third = await context.newPage();
    let sockets = 0;
    third.on("websocket", () => {
      sockets += 1;
    });
    await third.goto(`${baseURL}/room/${code}?mode=host`);
    await expect(third.locator("text=ホスト画面は上限")).toBeVisible({ timeout: 10_000 });

    // 再接続を繰り返さない（繰り返すと同室全員の再接続予算を食う）
    const opened = sockets;
    await third.waitForTimeout(4_000);
    expect(sockets).toBe(opened);
  } finally {
    await context.close();
  }
});

test("QRや共有リンクから開いた人は、名前とレベルを申告してから参加する", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ extraHTTPHeaders: clientIpHeaders(test.info().title) });
  const owner = await context.newPage();

  try {
    await owner.goto(baseURL!);
    await owner.fill('input[placeholder="なまえ"]', "Player1");
    await owner.click('.level-chip:has-text("Lv.3")');
    await owner.click("text=部屋を作る");
    await owner.waitForSelector(".room-chip .code");
    const code = ((await owner.locator(".room-chip .code").textContent()) ?? "").trim();

    // QRの中身と同じURLを直接開く
    const guest = await context.newPage();
    await guest.goto(`${baseURL}/room/${code}`);

    // 自動参加せず、部屋コードが入った状態のホームが出る
    await expect(guest.locator('input[placeholder="なまえ"]')).toBeVisible();
    await expect(guest.locator('input[placeholder="部屋コード"]')).toHaveValue(code);
    await expect(owner.locator(".roster .beb-tile:not(.empty)")).toHaveCount(1);

    await guest.fill('input[placeholder="なまえ"]', "Guest");
    await guest.click('.level-chip:has-text("Lv.2")');
    await guest.click("text=参加する");
    await guest.waitForSelector(".room-chip .code");

    await expect(owner.locator(".roster .beb-tile:not(.empty)")).toHaveCount(2);
    await expect(owner.locator(".roster")).toContainText("Guest");
  } finally {
    await context.close();
  }
});
