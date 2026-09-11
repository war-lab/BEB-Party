// BLIND ROOMの盤面アイコン（SVG）の検査（ADR-0025、基本設計/12のコンテンツ形式）。
//
// ゲームモジュール側に置かない。GameModule.validateContent はWorkerのバンドルに入るため
// node:fs に触れず（基本設計/05）、パッケージへnodeの型を足すと、モジュール本体が
// node APIを使っても tsc が気づかなくなる。CI用の検証は tools が持つ。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ICON_BASE_PATH, type BlindRoomPack, type ItemDefinition } from "@beb/shared-blindroom";
import { describe, expect, it } from "vitest";

// 置き場所は ICON_BASE_PATH から導く。gameIdリテラルを書けるのは
// registry.tsとclient/appだけである（基本設計/07の検査3）
const gameId = ICON_BASE_PATH.split("/").filter(Boolean).at(-1) ?? "";
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const contentDir = path.join(repoRoot, "content", gameId);
const iconDir = path.join(repoRoot, "client", "public", ICON_BASE_PATH.slice(1));

/** アイコンに使ってよい色。ビジュアルデザイン.mdのトークンと、盤面用に固定した5色（ADR-0025） */
const ALLOWED_COLORS = ["#161B33", "#F7F8FD", "#FF3D3D", "#2E7CF6", "#FFC400", "none"];

const packs: BlindRoomPack[] = readdirSync(contentDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(path.join(contentDir, name), "utf8")) as BlindRoomPack);

const items: ItemDefinition[] = packs.flatMap((pack) => pack.itemSets.flatMap((set) => set.items));

function svgOf(icon: string): string {
  return readFileSync(path.join(iconDir, `${icon}.svg`), "utf8");
}

/** 色を除いた図形の定義。色違いが同じ形かを比べるために使う */
function geometryOf(svg: string): string {
  return svg.replace(/fill="[^"]*"/g, "").replace(/\s+/g, " ");
}

describe("アイコンの実在", () => {
  it("収録したすべてのアイテムにSVGがある", () => {
    expect(items.length).toBeGreaterThan(0);
    const missing = items.filter((item) => !existsSync(path.join(iconDir, `${item.icon}.svg`)));
    expect(missing.map((item) => item.icon)).toEqual([]);
  });

  it("使われていないSVGが残っていない", () => {
    const used = new Set(items.map((item) => item.icon));
    const orphans = readdirSync(iconDir)
      .filter((name) => name.endsWith(".svg"))
      .map((name) => name.replace(/\.svg$/, ""))
      .filter((icon) => !used.has(icon));
    expect(orphans).toEqual([]);
  });
});

describe("アイコンの中身", () => {
  it("外部参照とスクリプトを含まない", () => {
    for (const item of items) {
      const svg = svgOf(item.icon);
      expect(svg).not.toContain("<script");
      expect(svg).not.toContain("<image");
      expect(svg).not.toContain("href");
      expect(svg).not.toContain("@import");
    }
  });

  it("塗りが決めた5色に収まる", () => {
    for (const item of items) {
      const fills = [...svgOf(item.icon).matchAll(/fill="([^"]*)"/g)].map((match) => match[1] ?? "");
      const unexpected = fills.filter((fill) => !ALLOWED_COLORS.includes(fill));
      expect(unexpected, `${item.icon} に想定外の色がある`).toEqual([]);
    }
  });

  it("1件2KB以内に収まる", () => {
    for (const item of items) {
      expect(svgOf(item.icon).length, `${item.icon} が大きすぎる`).toBeLessThan(2048);
    }
  });
});

describe("色違いペアの同一性", () => {
  /**
   * `red_x` と `blue_x` は、色を除いた図形の定義が完全に一致していなければならない。
   *
   * 形が違うと、聞き手は色ではなく形で見分けられてしまい、修飾語を言わせるという
   * standardセットの狙いが消える（12のレベル差の吸収）。
   */
  it("色を除いた定義が一致する", () => {
    const pairs = items
      .map((item) => item.icon)
      .filter((icon) => icon.startsWith("red_"))
      .map((icon) => [icon, icon.replace(/^red_/, "blue_")] as const)
      .filter(([, blue]) => existsSync(path.join(iconDir, `${blue}.svg`)));

    expect(pairs.length).toBeGreaterThan(0);
    for (const [red, blue] of pairs) {
      expect(geometryOf(svgOf(red)), `${red} と ${blue} の形が違う`).toBe(geometryOf(svgOf(blue)));
    }
  });

  it("ペアの色は実際に違う", () => {
    for (const icon of items.map((item) => item.icon).filter((name) => name.startsWith("red_"))) {
      const blue = icon.replace(/^red_/, "blue_");
      expect(svgOf(icon)).not.toBe(svgOf(blue));
    }
  });
});
