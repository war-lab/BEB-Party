import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatFinding, validateCase } from "@beb/server-detectives";
import {
  runValidation,
  runValidationOnFile,
  selectValidator,
  toGameReport,
  type GameValidator,
} from "./run";

const CONTENT_PATH = "content/sample-game";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "beb-validate-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function caseValidator(contentPath: string = CONTENT_PATH): GameValidator {
  return { contentPath, validate: (content) => toGameReport(validateCase(content), formatFinding) };
}

function validators(): GameValidator[] {
  return [caseValidator()];
}

function writeCase(name: string, content: unknown): string {
  const directory = join(repoRoot, CONTENT_PATH);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify(content), "utf8");
  return path;
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
    const result = runValidation(realRoot, [caseValidator("content/detectives")]);
    expect(result.lines.join("\n")).not.toContain("[ERROR]");
    expect(result.exitCode).toBe(0);
  });
});

describe("selectValidator", () => {
  // ゲームが2本目に入ると、単一ファイル検証でどのゲームの検証を使うかの判別が必要になる
  const targets: GameValidator[] = [caseValidator("content/detectives"), caseValidator("content/dontsayit")];

  it("パスに含まれるcontentディレクトリでゲームを選ぶ", () => {
    expect(selectValidator(targets, "/repo/content/dontsayit/world.json")?.contentPath).toBe("content/dontsayit");
    expect(selectValidator(targets, "/repo/content/detectives/cafe.json")?.contentPath).toBe("content/detectives");
  });

  it("Windowsの区切り文字でも選べる", () => {
    expect(selectValidator(targets, "C:\\repo\\content\\dontsayit\\world.json")?.contentPath).toBe("content/dontsayit");
  });

  it("リポジトリ相対のパスでも選べる", () => {
    expect(selectValidator(targets, "content/dontsayit/world.json")?.contentPath).toBe("content/dontsayit");
  });

  it("どのゲームのcontent配下でもないパスは選べない", () => {
    expect(selectValidator(targets, "/repo/docs/README.md")).toBeUndefined();
  });
});

describe("runValidationOnFile", () => {
  it("パスからゲームを判別して検証する", () => {
    const path = writeCase("bad.json", { id: "bad_v1" });
    const result = runValidationOnFile(path, validators());
    expect(result.exitCode).toBe(1);
    expect(result.lines.join("\n")).toContain("bad_v1");
  });

  it("存在しないファイルをエラーにする", () => {
    const result = runValidationOnFile(join(repoRoot, "missing.json"), validators());
    expect(result.exitCode).toBe(1);
    expect(result.lines.join("\n")).toContain("ファイルが見つからない");
  });

  it("どのゲームのcontent配下でもないファイルをエラーにする", () => {
    const path = join(repoRoot, "stray.json");
    writeFileSync(path, "{}", "utf8");
    const result = runValidationOnFile(path, validators());
    expect(result.exitCode).toBe(1);
    expect(result.lines.join("\n")).toContain("どのゲームのcontent配下でもない");
  });
});
