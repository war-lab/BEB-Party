// プレイヤーアイコンの生成。128x128の座標系に描いた図形をPNGへ書き出す。
//
// 一覧とIDの正本は shared/core/src/player-icon.ts の PLAYER_ICONS（ADR-0022）。
// 絵の正本は icons-source/player-icons-art.mjs の描画コードとする。
// 生成物はコミットし、CIで再生成との差分を検査する（基本設計/07）。
//
// 第1引数に倍率を渡すと、その倍率で書き出す（例: `node scripts/generate-player-icons.mjs 4` で512px）。
// 投影用に大きく出す場合に使う。既定の1倍（128px）だけをコミットする。
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png.mjs";
import { Canvas } from "../icons-source/draw.mjs";
import { GRID, ICONS, OUTLINE, OUTLINE_WIDTH } from "../icons-source/player-icons-art.mjs";

const scale = Number(process.argv[2] ?? 1);
if (!Number.isInteger(scale) || scale < 1) {
  throw new Error(`倍率は1以上の整数で指定する（受け取った値: ${process.argv[2]}）`);
}

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const pngDir =
  scale === 1
    ? path.join(rootDir, "client", "public", "player-icons")
    : path.join(rootDir, "client", "app", "icons-source", `out-${GRID * scale}`);

function toPng(canvas) {
  const rgba = new Uint8Array(canvas.size * canvas.size * 4);
  for (let i = 0; i < canvas.cells.length; i += 1) {
    const color = canvas.cells[i];
    if (!color) {
      continue;
    }
    rgba[i * 4] = parseInt(color.slice(1, 3), 16);
    rgba[i * 4 + 1] = parseInt(color.slice(3, 5), 16);
    rgba[i * 4 + 2] = parseInt(color.slice(5, 7), 16);
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(canvas.size, canvas.size, rgba);
}

mkdirSync(pngDir, { recursive: true });
// 一覧から消えたIDのファイルが残らないよう、生成先を作り直す
for (const name of readdirSync(pngDir)) {
  rmSync(path.join(pngDir, name));
}

let bytes = 0;
for (const icon of ICONS) {
  const canvas = new Canvas(GRID, scale);
  icon.draw(canvas);
  canvas.outline(OUTLINE, OUTLINE_WIDTH);
  const png = toPng(canvas);
  bytes += png.length;
  writeFileSync(path.join(pngDir, `${icon.id}.png`), png);
}
console.log(`generated ${ICONS.length} icons (${GRID * scale}px, ${Math.round(bytes / 1024)}KB total) -> ${path.relative(rootDir, pngDir)}`);
