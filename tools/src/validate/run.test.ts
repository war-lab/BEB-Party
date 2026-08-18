import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateCase } from "@beb/server-detectives";
import { runValidation, type GameValidator } from "./run";

const CONTENT_PATH = "content/sample-game";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "beb-validate-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function validators(): GameValidator[] {
  return [{ contentPath: CONTENT_PATH, validate: validateCase }];
}

function writeCase(name: string, content: unknown): void {
  const directory = join(repoRoot, CONTENT_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), JSON.stringify(content), "utf8");
}

describe("runValidation", () => {
  it("contentディレクトリが存在しないときはスキップして成功する", () => {
    const result = runValidation(repoRoot, validators());
    expect(result.exitCode).toBe(0);
    expect(result.lines).toEqual([`::notice::${CONTENT_PATH} が存在しないため検証をスキップする`]);
  });

  it("contentディレクトリが存在して0件のときはエラーにする", () => {
    mkdirSync(join(repoRoot, CONTENT_PATH), { recursive: true });
    const result = runValidation(repoRoot, validators());
    expect(result.exitCode).toBe(1);
    expect(result.lines.join("\n")).toContain("検証対象のJSONが1件もない");
  });

  it("JSONとして読めないファイルをエラーにする", () => {
    const directory = join(repoRoot, CONTENT_PATH);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "broken.json"), "{ not json", "utf8");
    const result = runValidation(repoRoot, validators());
    expect(result.exitCode).toBe(1);
    expect(result.lines.join("\n")).toContain("JSONとして読めない");
  });

  it("検証に失敗した事件を反例つきで報告し、非0で終わる", () => {
    writeCase("bad.json", { id: "bad_v1" });
    const result = runValidation(repoRoot, validators());
    expect(result.exitCode).toBe(1);
    expect(result.lines.join("\n")).toContain("bad_v1");
    expect(result.lines.join("\n")).toContain("schema");
  });

  it("リポジトリの実データ（content/detectives）が検証を通る", () => {
    // CLIの成功経路と、収録済みの事件そのものを同時に守る。
    // 事件を追加してこのテストだけが落ちた場合は、事件データ側を直す（M1 PR7の禁止事項）
    const realRoot = fileURLToPath(new URL("../../..", import.meta.url));
    const result = runValidation(realRoot, [
      { contentPath: "content/detectives", validate: validateCase },
    ]);
    expect(result.lines.join("\n")).not.toContain("[ERROR]");
    expect(result.exitCode).toBe(0);
  });
});
