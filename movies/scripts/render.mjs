// 4本をMP4へレンダリングする。
//
// Motion Canvasに文書化されたCLI・ヘッドレスのレンダリング経路は無く、エディタ（ブラウザ）が
// 唯一の入口である。フレームの生成はブラウザ側、MP4への書き出しは vite プラグインの
// サーバ側（@motion-canvas/ffmpeg）が担うため、devサーバとブラウザの両方が必要になる。
//
// 1ゲーム=1プロジェクトにしてあるため、プロジェクトのURLを開いてRenderを押すだけで
// その1本が出る（範囲の指定が要らない。src/projects/*.ts の先頭コメント）。
//
// 使い方: pnpm --filter @beb/movies run render
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);

const ROOT = path.join(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "output");

/** src/projects/*.ts のファイル名。プロジェクトのURLもこの名前で決まる */
const PROJECTS = ["detectives", "dontsayit", "ranking", "whowrotethis"];

/**
 * 空いているポートを順に探す。
 *
 * 固定ポートにすると、前回のレンダリングで残ったviteが居座って
 * "Port is already in use" で失敗する（実測）。
 * ポート0のOS自動割当はこの環境で EACCES になるため使わない（実測）。
 */
async function freePort(start = 9010, attempts = 40) {
  for (let port = start; port < start + attempts; port += 1) {
    const available = await new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, "localhost");
    });
    if (available) {
      return port;
    }
  }
  throw new Error("空きポートが見つからない");
}

function startEditor(port) {
  // Windowsでは .cmd を直接spawnできない（Node 20以降は EINVAL になる。実測）。
  // viteのJS実体を直接nodeで起動すれば、シェルを経由せずに済む。
  // bin は package.json の exports に無いため、package.json の位置から辿る
  const vitePkg = require.resolve("vite/package.json");
  const viteBin = path.join(path.dirname(vitePkg), "bin", "vite.js");
  const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
  return child;
}

async function waitForEditor(base, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(`${base}/`)).ok) {
        return;
      }
    } catch {
      // 起動待ち
    }
    if (Date.now() > deadline) {
      throw new Error("エディタが起動しない");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** エディタの進捗バー（0〜100）を読む。レンダリング中だけ伸びる */
async function readProgress(page) {
  return await page.evaluate(() => {
    const fill = document.querySelector("[class*=progressFill]");
    const style = fill?.getAttribute("style") ?? "";
    const match = /width:\s*([\d.]+)%/.exec(style);
    return match ? Number(match[1]) : 0;
  });
}

/**
 * レンダリングが終わるまで待つ。
 *
 * 判定にはエディタの進捗バーを使う。他の手段はすべて外した（いずれも実測）。
 *
 * * UIの「Rendering」の文字列: 設定パネルに常時その節があり、永久に完了しない
 * * 出力ファイルの出現: ffmpegはヘッダ（48バイト）を即座に書くため、出た時点では空
 * * 出力ファイルのサイズが伸びないこと: ヘッダを書いた直後に伸びが止まり、空のまま完了と誤判定する
 * * 「増えたファイル」の差分: 前回の残骸が消せていないと永久に0件になる
 */
async function waitForRender(page, timeoutMs = 1_800_000) {
  const deadline = Date.now() + timeoutMs;
  let started = false;
  let last = -1;

  for (;;) {
    const progress = await readProgress(page);
    if (progress > 0) {
      started = true;
    }
    if (Math.floor(progress / 10) !== Math.floor(last / 10)) {
      process.stdout.write(`    ${progress.toFixed(0)}%\n`);
      last = progress;
    }
    // 始まったうえで0へ戻る（バーが片付く）のが完了の合図
    if (started && progress === 0) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error("レンダリングが終わらない");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** 出力が実体を持つか確かめる。ヘッダだけ（数十バイト）なら失敗として扱う */
function assertVideo(target) {
  if (!existsSync(target)) {
    throw new Error(`出力がない: ${target}`);
  }
  const { size } = statSync(target);
  if (size < 100_000) {
    throw new Error(`出力が空に近い（${size}バイト）: ${target}`);
  }
  return size;
}

async function renderProject(page, base, name) {
  const target = path.join(OUTPUT, `${name}.mp4`);

  await page.goto(`${base}/src/projects/${name}`);
  await page.waitForSelector("canvas", { timeout: 60_000 });
  // 素材（実画面のPNG）の読み込みを待つ。読み込み前に始めると空のフレームが混ざる
  await page.waitForTimeout(3000);

  // ボタンの表示は "Render"（見た目の大文字はCSS）。exact:true は大小を区別して外れるため、
  // テキストの正規表現で引く（実測で exact:true が一致しなかった）
  const renderButton = page.locator("button").filter({ hasText: /^Render$/ }).first();
  await renderButton.waitFor({ state: "visible", timeout: 30_000 });
  await renderButton.click();

  await waitForRender(page);
  const size = assertVideo(target);
  return { target, size };
}

async function main() {
  if (!existsSync(OUTPUT)) {
    mkdirSync(OUTPUT, { recursive: true });
  }
  const port = await freePort();
  // viteはlocalhostで待受する。127.0.0.1で叩くと接続を拒否される（実測）
  const base = `http://localhost:${port}`;
  process.stdout.write(`エディタ: ${base}\n`);

  const editor = startEditor(port);
  const browser = await chromium.launch();
  try {
    await waitForEditor(base);
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    for (const name of PROJECTS) {
      process.stdout.write(`\n=== ${name}\n`);
      const started = Date.now();
      const { target, size } = await renderProject(page, base, name);
      const seconds = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(`--- 出力: ${target}（${(size / 1_000_000).toFixed(1)}MB / ${seconds}秒）\n`);
    }
  } finally {
    await browser.close();
    editor.kill();
    // viteを止めても、その子として起きたffmpegは残ることがある。
    // 残ると出力ファイルを掴み続け、次回の実行で削除も上書き判定もできなくなる（実測）
    killStrayFfmpeg();
  }
}

/** 書き出しに使われたffmpegを落とす。残すと次回の実行が出力ファイルを掴まれて詰まる */
function killStrayFfmpeg() {
  if (process.platform !== "win32") {
    return;
  }
  try {
    spawn("taskkill", ["/F", "/IM", "ffmpeg.exe"], { stdio: "ignore" }).unref();
  } catch {
    // 残っていなければ失敗してよい
  }
}

await main();
