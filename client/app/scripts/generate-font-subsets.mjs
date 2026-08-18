// フォントのグリフサブセット生成。入力はclient/のUI固定文言、ゲーム選択画面に出る
// カタログの文言（server/games/のGameModuleのtitle・tagline・icon）、
// content/detectives/*.jsonの日本語フィールドの和とする（基本設計/04_事件データと検証.md）。
// CIのビルド工程に組み込む。
// 出力(client/public/fonts/*.subset.woff2)はコミットし、CIで再生成との差分チェックを行う
// （事件追加PRでの再生成忘れを検知するため）
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const outputDir = path.join(rootDir, "client", "public", "fonts");

// ASCIIの印字可能文字は常に含める（未使用のUI文言に依存しない土台として）
const BASE_CHARS = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)).join("");

async function collectUiText() {
  const targets = [
    path.join(rootDir, "client", "core", "src"),
    path.join(rootDir, "client", "app", "src"),
    path.join(rootDir, "client", "games"),
  ];
  let text = "";
  for (const dir of targets) {
    if (!existsSync(dir)) continue;
    text += await walk(dir);
  }
  return text;
}

async function walk(dir) {
  let text = "";
  // readdirの返す順序はOS・ファイルシステムに依存し、Linux(CI)とWindows(開発機)で異なりうる。
  // 名前でソートして走査順を固定する(文字集合自体は同じでも、抽出時の連結順序が変わると
  // 生成されるサブセットのバイト列が変わってしまうことをCIで実測したため)
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      text += await walk(full);
    } else if (/\.(svelte|ts)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      // 改行コード(CRLF/LF)の差を吸収する。Windows(開発機)はgitのcore.autocrlfでCRLFに
      // 変換されうるが、Linux(CI)はLFのまま読まれるため、\rの有無で抽出文字集合が
      // 実際にずれ、生成物のバイト列が変わってしまうことを実測した
      text += readFileSync(full, "utf8").replace(/\r/g, "");
    }
  }
  return text;
}

/**
 * ゲーム選択画面に出る文言（GameModuleのtitle・tagline・icon）を集める。
 *
 * 実体はサーバ側にあるが、/api/catalogでクライアントへ配られて画面に出るため、
 * サブセットの入力に含める。サーバのソース全体を舐めると日本語コメントまで拾って
 * サブセットが数十KB膨らむので、カタログに載るフィールドの値だけを抜く。
 */
async function collectCatalogText() {
  const dir = path.join(rootDir, "server", "games");
  if (!existsSync(dir)) {
    return "";
  }
  const source = await walk(dir);
  const matches = source.matchAll(/(?:title|tagline|icon):\s*"([^"]*)"/g);
  return [...matches].map((match) => match[1]).join("");
}

function collectContentJapanese() {
  // content/<gameId>/ を全て走査する。ゲームを追加したときに日本語が抜けて豆腐になるのを防ぐ
  const contentRoot = path.join(rootDir, "content");
  if (!existsSync(contentRoot)) {
    return "";
  }
  const fields = ["ja", "hintJa", "meaningJa", "briefingJa"];
  let text = "";
  const gameDirs = readdirSync(contentRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const gameDir of gameDirs) {
    const contentDir = path.join(contentRoot, gameDir);
    const files = readdirSync(contentDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
    for (const file of files) {
      const data = JSON.parse(readFileSync(path.join(contentDir, file), "utf8").replace(/\r\n/g, "\n"));
      text += extractFields(data, fields);
    }
  }
  return text;
}

function extractFields(value, fields) {
  if (typeof value === "string") return "";
  if (Array.isArray(value)) return value.map((v) => extractFields(v, fields)).join("");
  if (value && typeof value === "object") {
    let text = "";
    for (const [key, v] of Object.entries(value)) {
      if (fields.includes(key) && typeof v === "string") {
        text += v;
      } else {
        text += extractFields(v, fields);
      }
    }
    return text;
  }
  return "";
}

async function main() {
  mkdirSync(outputDir, { recursive: true });

  const uiText = await collectUiText();
  const catalogText = await collectCatalogText();
  const contentText = collectContentJapanese();
  // 文字の集合をソート・重複排除して正規化する。ディレクトリ走査順をソートしても
  // ファイル内容の連結順序までは揃わないため、最終的な文字集合自体を正規形にすることで
  // 生成物のバイト列をプラットフォーム非依存にする(CIのLinuxと開発機のWindowsで
  // 異なるバイト列が生成され、差分チェックが誤って失敗することを実測したため)
  const text = Array.from(new Set(BASE_CHARS + uiText + catalogText + contentText)).sort().join("");

  const fonts = [
    {
      name: "DelaGothicOne-Regular",
      source: path.join(rootDir, "client", "app", "fonts-source", "dela-gothic-one", "DelaGothicOne-Regular.ttf"),
      licenseDir: path.join(rootDir, "client", "app", "fonts-source", "dela-gothic-one"),
    },
    {
      name: "MPLUSRounded1c-Regular",
      source: path.join(rootDir, "client", "app", "fonts-source", "m-plus-rounded-1c", "MPLUSRounded1c-Regular.ttf"),
      licenseDir: path.join(rootDir, "client", "app", "fonts-source", "m-plus-rounded-1c"),
    },
    {
      name: "MPLUSRounded1c-Bold",
      source: path.join(rootDir, "client", "app", "fonts-source", "m-plus-rounded-1c", "MPLUSRounded1c-Bold.ttf"),
      licenseDir: path.join(rootDir, "client", "app", "fonts-source", "m-plus-rounded-1c"),
    },
  ];

  for (const font of fonts) {
    const buffer = readFileSync(font.source);
    const subsetBuffer = await subsetFont(buffer, text, { targetFormat: "woff2" });
    const outputPath = path.join(outputDir, `${font.name}.subset.woff2`);
    writeFileSync(outputPath, subsetBuffer);
    console.log(`generated ${outputPath} (${subsetBuffer.length} bytes)`);

    const licenseSrc = path.join(font.licenseDir, "OFL.txt");
    const licenseDest = path.join(outputDir, `${path.basename(font.licenseDir)}.OFL.txt`);
    copyFileSync(licenseSrc, licenseDest);
  }
}

await main();
