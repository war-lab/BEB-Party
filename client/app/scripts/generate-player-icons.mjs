// プレイヤーアイコンの生成。16x16のドットマップから、SVG（等倍・ベクタ）と
// PNG（64x64、最近傍で4倍）を書き出す。
//
// 一覧とIDの正本は shared/core/src/player-icon.ts の PLAYER_ICONS（ADR-0022）。
// 絵の正本は icons-source/player-icons-map.mjs のドットマップとする。
// 生成物はコミットし、CIで再生成との差分を検査する（基本設計/07）。
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png.mjs";
import { GRID, ICONS, PALETTE } from "../icons-source/player-icons-map.mjs";

const SCALE = 4; // 16 * 4 = 64px
const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const pngDir = path.join(rootDir, "client", "public", "player-icons");
const svgDir = path.join(rootDir, "client", "app", "icons-source", "svg");

/** ドットマップを「1マス1色」の2次元配列にする。未定義の記号は落とさずエラーにする */
function toGrid(id, map, colors) {
  const rows = map.trim().split("\n").map((row) => row.trimEnd());
  if (rows.length !== GRID) {
    throw new Error(`${id}: 行数が${GRID}でない（${rows.length}行）`);
  }
  return rows.map((row, y) => {
    if (row.length !== GRID) {
      throw new Error(`${id}: ${y}行目の桁数が${GRID}でない（${row.length}桁）`);
    }
    return [...row].map((ch) => {
      if (ch === ".") {
        return null;
      }
      const color = colors[ch] ?? PALETTE[ch];
      if (!color) {
        throw new Error(`${id}: 記号 '${ch}' に色の定義が無い`);
      }
      return color;
    });
  });
}

function toSvg(id, labelJa, grid) {
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges" role="img" aria-label="${labelJa}">`,
    `  <title>${labelJa}</title>`,
  ];
  // 同色が横に連続する区間は1つの矩形にまとめる（ファイルを小さく、差分を読みやすくする）
  for (let y = 0; y < GRID; y += 1) {
    let x = 0;
    while (x < GRID) {
      const color = grid[y][x];
      if (!color) {
        x += 1;
        continue;
      }
      let width = 1;
      while (x + width < GRID && grid[y][x + width] === color) {
        width += 1;
      }
      lines.push(`  <rect x="${x}" y="${y}" width="${width}" height="1" fill="${color}"/>`);
      x += width;
    }
  }
  lines.push("</svg>");
  return lines.join("\n") + "\n";
}

function toPng(grid) {
  const size = GRID * SCALE;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = grid[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
      const at = (y * size + x) * 4;
      if (!color) {
        continue;
      }
      rgba[at] = parseInt(color.slice(1, 3), 16);
      rgba[at + 1] = parseInt(color.slice(3, 5), 16);
      rgba[at + 2] = parseInt(color.slice(5, 7), 16);
      rgba[at + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(pngDir, { recursive: true });
mkdirSync(svgDir, { recursive: true });
// 一覧から消えたIDのファイルが残らないよう、生成先を作り直す
for (const dir of [pngDir, svgDir]) {
  for (const name of readdirSync(dir)) {
    rmSync(path.join(dir, name));
  }
}

let bytes = 0;
for (const icon of ICONS) {
  const grid = toGrid(icon.id, icon.map, icon.colors ?? {});
  const png = toPng(grid);
  bytes += png.length;
  writeFileSync(path.join(pngDir, `${icon.id}.png`), png);
  writeFileSync(path.join(svgDir, `${icon.id}.svg`), toSvg(icon.id, icon.labelJa, grid), "utf8");
}
console.log(`generated ${ICONS.length} icons (PNG ${GRID * SCALE}px, ${Math.round(bytes / 1024)}KB total)`);
