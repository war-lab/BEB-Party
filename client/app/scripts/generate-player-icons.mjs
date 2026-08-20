// プレイヤーアイコンの生成。48x48のドット絵を整数倍してPNGへ書き出す。
//
// 一覧とIDの正本は shared/core/src/player-icon.ts の PLAYER_ICONS（ADR-0022）。
// 絵の正本は icons-source/player-icons-pixels.mjs のパレットと行データとする。
// 生成物はコミットし、CIで再生成との差分を検査する（基本設計/07）。
//
// 第1引数に倍率を渡すと、その倍率で書き出す（例: `node scripts/generate-player-icons.mjs 8` で384px）。
// 投影用に大きく出す場合に使う。既定の2倍（96px）だけをコミットする。
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png.mjs";
import { GRID, ICONS, SCALE } from "../icons-source/player-icons-pixels.mjs";

const scale = Number(process.argv[2] ?? SCALE);
if (!Number.isInteger(scale) || scale < 1) {
  throw new Error(`倍率は1以上の整数で指定する（受け取った値: ${process.argv[2]}）`);
}

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const outDir =
  scale === SCALE
    ? path.join(rootDir, "client", "public", "player-icons")
    : path.join(rootDir, "client", "app", "icons-source", `out-${GRID * scale}`);

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

function toPng(icon) {
  if (icon.rows.length !== GRID) {
    throw new Error(`${icon.id}: 行数が${GRID}でない（${icon.rows.length}行）`);
  }
  const size = GRID * scale;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < GRID; y += 1) {
    const row = icon.rows[y];
    if (row.length !== GRID) {
      throw new Error(`${icon.id}: ${y}行目の桁数が${GRID}でない（${row.length}桁）`);
    }
    for (let x = 0; x < GRID; x += 1) {
      const ch = row[x];
      if (ch === ".") {
        continue;
      }
      const at = CHARS.indexOf(ch);
      const color = icon.palette[at];
      if (!color) {
        throw new Error(`${icon.id}: ${y}行${x}桁の記号 '${ch}' がパレットの範囲外`);
      }
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const p = ((y * scale + dy) * size + x * scale + dx) * 4;
          rgba[p] = r;
          rgba[p + 1] = g;
          rgba[p + 2] = b;
          rgba[p + 3] = 255;
        }
      }
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(outDir, { recursive: true });
// 一覧から消えたIDのファイルが残らないよう、生成先を作り直す
for (const name of readdirSync(outDir)) {
  rmSync(path.join(outDir, name));
}

let bytes = 0;
for (const icon of ICONS) {
  const png = toPng(icon);
  bytes += png.length;
  writeFileSync(path.join(outDir, `${icon.id}.png`), png);
}
console.log(
  `generated ${ICONS.length} icons (${GRID * scale}px, ${Math.round(bytes / 1024)}KB total) -> ${path.relative(rootDir, outDir)}`,
);
