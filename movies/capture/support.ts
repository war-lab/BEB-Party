// 素材撮影の共通処理。
//
// 検証ではなく素材の生成であるため、E2Eのヘルパー（e2e/support/room.ts）とは目的が違う。
// 共通なのは「5〜6人の卓を立てる」までで、そこはE2E側を再利用する。
// ここが持つのは「撮る」側の関心（出力先・命名・待ちの安定化）だけとする。
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

/** 素材の出力先。生成物であり、リポジトリにはコミットしない（movies/.gitignore） */
export const SHOTS_DIR = path.join(import.meta.dirname, "..", "assets", "shots");

export function ensureShotsDir(): void {
  if (!existsSync(SHOTS_DIR)) {
    mkdirSync(SHOTS_DIR, { recursive: true });
  }
}

/**
 * 1枚撮る。名前は `<ゲーム>-<ステージ>[-<役>]` とし、シーン側から引きやすくする。
 *
 * アニメーション（カットインの溜め・成立枚数の跳ね）が動いている最中に撮ると
 * 中途半端な絵になるため、撮る前に少し待つ。待ち時間は演出の長さ（600ms）より長く取る。
 */
export async function shoot(page: Page, name: string, settleMs = 900): Promise<string> {
  ensureShotsDir();
  await page.waitForTimeout(settleMs);
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  return file;
}

/** その端末で見えている要素から役を判定する。どの端末が何になるかはサーバが決める */
export async function findPageBy(pages: Page[], selector: string, timeoutMs = 20_000): Promise<Page> {
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

/**
 * 配役・お題の伏せ面を開いて準備完了を送る（撮影用の寛容版）。
 *
 * E2Eの readyAll は「伏せ面が必ずある」前提で待つ。撮影では素材のために先に開くページがあり、
 * その状態で同じ手順を通すと待ちが解けない（実測でハングした）。
 * ここでは開いているかどうかを見てから進める。
 */
export async function readyAllTolerant(pages: Page[], coverTestId: string): Promise<void> {
  for (const page of pages) {
    // 伏せ面の描画を待たずに isVisible で判定すると、まだ出ていないページを素通りして
    // そのページだけ準備完了を送れず、ステージが進まない（実測でハングした）。
    // 「伏せ面」か「準備完了」のどちらかが出るまで待ってから分岐する
    const cover = page.locator(`[data-testid='${coverTestId}']`);
    const ready = page.locator(".beb-btn:has-text('準備できた')");
    await cover.or(ready).first().waitFor({ state: "visible", timeout: 30_000 });

    if (await cover.isVisible()) {
      await cover.click();
      const confirm = page.locator(".beb-btn:has-text('確認した')");
      await confirm.waitFor({ state: "visible", timeout: 15_000 });
      await confirm.click();
    }
    await ready.waitFor({ state: "visible", timeout: 15_000 });
    await ready.click();
  }
}

/**
 * ENGLISH RANKINGの目標カットインを開いて確認を送る（撮影用）。
 *
 * 伏せ面と確認ボタンが同じカットインの中にあり、開かないと確認を押せない。
 * readyAllTolerant と分けているのは、待つ対象と押す順序が違うためである。
 */
export async function confirmGoalsTolerant(pages: Page[]): Promise<void> {
  for (const page of pages) {
    const cover = page.locator("[data-testid='goal-cover']");
    const confirm = page.locator("[data-testid='goal-confirm']");
    // すでに確認済みのページ（撮影のために先に開いた端末）はどちらも出ない
    const appeared = await cover
      .or(confirm)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) {
      continue;
    }
    if (await cover.isVisible()) {
      await cover.click();
    }
    await confirm.waitFor({ state: "visible", timeout: 15_000 });
    await confirm.click();
  }
}

/** ホストがゲームとコンテンツを選び、必要なら秒数を詰めて開始する */
export async function startWith(
  host: Page,
  gameTitle: string,
  contentTitle: string,
  seconds?: number,
): Promise<void> {
  await host.click(`.title-card:has-text("${gameTitle}")`);
  await host.click(`.content-chip:has-text("${contentTitle}")`);
  if (seconds !== undefined) {
    const input = host.locator("label.seconds input[type='number']");
    if (await input.count()) {
      await input.fill(String(seconds));
      await input.blur();
    }
  }
  await host.click(".beb-btn:has-text('ゲームスタート')");
}
