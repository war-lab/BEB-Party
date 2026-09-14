// クライアントのスタイル規約の検査（ビジュアルデザイン.mdの「形状・エフェクト」）。
//
// blindroom-icons.test.ts と同じ理由で tools に置く。検査対象は client/ のソースであり、
// ゲームモジュールのバンドルに node:fs を持ち込まないため、CI用の走査はここに集める。
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const clientDir = path.join(repoRoot, "client");

/** 走査から外すディレクトリ。依存と生成物には規約を適用しない */
const SKIP_DIRS = new Set(["node_modules", "dist", ".vite", ".svelte-kit"]);
const TARGET_EXTENSIONS = [".svelte", ".css"];

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return SKIP_DIRS.has(name) ? [] : collectFiles(full);
    }
    return TARGET_EXTENSIONS.includes(path.extname(name)) ? [full] : [];
  });
}

const files = collectFiles(clientDir);

/** 片側だけに線を引く指定。左端の色付きバーを禁じるため、論理プロパティも併せて拾う */
const SIDE_BORDER = /border-(left|right|inline-start|inline-end)(-color|-width|-style)?\s*:/;

describe("スタイル規約", () => {
  it("走査対象のファイルが存在する", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // 面の片側だけに色の帯を出す装飾は使わない。強調は全周の輪郭・背景・ラベルで出す
  // （ビジュアルデザイン.mdの「細線を使わない。太い輪郭が基本」）。
  it("コンポーネントの左右端に色付きバーを出さない", () => {
    const violations = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => SIDE_BORDER.test(line))
        .map(({ line, index }) => `${path.relative(repoRoot, file)}:${index + 1}: ${line.trim()}`),
    );
    expect(violations).toEqual([]);
  });
});
