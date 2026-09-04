import { describe, expect, it } from "vitest";
import { ACTION_MAX_CHARS, NAME_MAX_LENGTH, SETTINGS_MAX_CHARS, parseClientMessage } from "./validate";

describe("parseClientMessage", () => {
  it("非オブジェクトを拒否する", () => {
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage("join")).toBeNull();
    expect(parseClientMessage(undefined)).toBeNull();
  });

  it("vまたはtypeが欠けている値を拒否する", () => {
    expect(parseClientMessage({ type: "join", name: "a", level: 1 })).toBeNull();
    expect(parseClientMessage({ v: 1, name: "a", level: 1 })).toBeNull();
  });

  it("未知のtypeを拒否する", () => {
    expect(parseClientMessage({ v: 1, type: "unknown" })).toBeNull();
  });

  it("joinを正しく検証する", () => {
    const result = parseClientMessage({ v: 1, type: "join", name: "Alice", level: 3 });
    expect(result).toEqual({ v: 1, type: "join", name: "Alice", level: 3, reconnectToken: undefined });
  });

  it("空の名前を拒否する", () => {
    expect(parseClientMessage({ v: 1, type: "join", name: "", level: 3 })).toBeNull();
    expect(parseClientMessage({ v: 1, type: "join", name: "   ", level: 3 })).toBeNull();
  });

  it("長すぎる名前を拒否する（stateブロードキャストで増幅されるため）", () => {
    const long = "あ".repeat(NAME_MAX_LENGTH + 1);
    expect(parseClientMessage({ v: 1, type: "join", name: long, level: 3 })).toBeNull();

    const limit = "あ".repeat(NAME_MAX_LENGTH);
    expect(parseClientMessage({ v: 1, type: "join", name: limit, level: 3 })).not.toBeNull();
  });

  it("iconを指定したjoinを受理する", () => {
    const result = parseClientMessage({ v: 1, type: "join", name: "Alice", level: 3, icon: "fox" });
    expect(result).toMatchObject({ type: "join", icon: "fox" });
  });

  it("icon未指定のjoinを受理する（旧SPAのタブが再接続してくる経路。基本設計/03）", () => {
    const result = parseClientMessage({ v: 1, type: "join", name: "Alice", level: 3 });
    expect(result).toMatchObject({ type: "join" });
    expect((result as { icon?: unknown }).icon).toBeUndefined();
  });

  it("一覧に無いiconを拒否する", () => {
    expect(parseClientMessage({ v: 1, type: "join", name: "Alice", level: 3, icon: "dinosaur-king" })).toBeNull();
    expect(parseClientMessage({ v: 1, type: "join", name: "Alice", level: 3, icon: 7 })).toBeNull();
  });

  it("名前の前後の空白を落とす", () => {
    const result = parseClientMessage({ v: 1, type: "join", name: "  Alice  ", level: 3 });
    expect(result).toMatchObject({ name: "Alice" });
  });

  it("大きすぎるsettingsのconfigureを拒否する", () => {
    const huge = { note: "x".repeat(SETTINGS_MAX_CHARS) };
    expect(parseClientMessage({ v: 1, type: "configure", contentId: "c", settings: huge })).toBeNull();
    expect(parseClientMessage({ v: 1, type: "configure", contentId: "c", settings: { note: "ok" } })).not.toBeNull();
  });

  it("joinのreconnectToken付きを正しく検証する", () => {
    const result = parseClientMessage({
      v: 1,
      type: "join",
      name: "Alice",
      level: 3,
      reconnectToken: "secret",
    });
    expect(result).toEqual({ v: 1, type: "join", name: "Alice", level: 3, reconnectToken: "secret" });
  });

  it("levelが範囲外のjoinを拒否する", () => {
    expect(parseClientMessage({ v: 1, type: "join", name: "Alice", level: 6 })).toBeNull();
    expect(parseClientMessage({ v: 1, type: "join", name: "Alice", level: 0 })).toBeNull();
  });

  it("nameが欠けているjoinを拒否する", () => {
    expect(parseClientMessage({ v: 1, type: "join", level: 3 })).toBeNull();
  });

  it("spectateを正しく検証する", () => {
    expect(parseClientMessage({ v: 1, type: "spectate" })).toEqual({ v: 1, type: "spectate" });
  });

  it("selectGameを正しく検証する", () => {
    expect(parseClientMessage({ v: 1, type: "selectGame", gameId: "some-game" })).toEqual({
      v: 1,
      type: "selectGame",
      gameId: "some-game",
    });
  });

  it("gameIdが欠けているselectGameを拒否する", () => {
    expect(parseClientMessage({ v: 1, type: "selectGame" })).toBeNull();
  });

  it("configureを正しく検証する(settingsはunknownのまま透過する)", () => {
    const result = parseClientMessage({
      v: 1,
      type: "configure",
      contentId: "case-01",
      settings: { investigationSeconds: 600 },
    });
    expect(result).toEqual({
      v: 1,
      type: "configure",
      contentId: "case-01",
      settings: { investigationSeconds: 600 },
    });
  });

  it("start/nextGameを正しく検証する", () => {
    expect(parseClientMessage({ v: 1, type: "start" })).toEqual({ v: 1, type: "start" });
    expect(parseClientMessage({ v: 1, type: "nextGame" })).toEqual({ v: 1, type: "nextGame" });
  });

  it("actionを正しく検証し、追加payloadを透過する", () => {
    const result = parseClientMessage({ v: 1, type: "action", action: "vote", targetPlayerId: "p1" });
    expect(result).toEqual({ v: 1, type: "action", action: "vote", targetPlayerId: "p1" });
  });

  it("actionフィールドが欠けているactionを拒否する", () => {
    expect(parseClientMessage({ v: 1, type: "action", targetPlayerId: "p1" })).toBeNull();
  });

  it("上限を超えるactionペイロードを拒否する（ADR-0023）", () => {
    const overLimit = "x".repeat(ACTION_MAX_CHARS);
    expect(parseClientMessage({ v: 1, type: "action", action: "submit", text: overLimit })).toBeNull();
  });

  it("上限内のactionペイロードを受理する（ADR-0023）", () => {
    // 判定はJSON.stringifyの長さで行う。{"text":"..."} の分だけ余裕を取る
    const withinLimit = "x".repeat(ACTION_MAX_CHARS - 20);
    const result = parseClientMessage({ v: 1, type: "action", action: "submit", text: withinLimit });
    expect(result).toMatchObject({ type: "action", action: "submit", text: withinLimit });
  });

  it("actionの長さ判定に action名 と v・type を数えない（ADR-0023）", () => {
    // 上限は残余ペイロードに課す。action名を長くしても残余の判定は変わらない
    const payload = { text: "x".repeat(ACTION_MAX_CHARS - 20) };
    const longActionName = "a".repeat(200);
    expect(parseClientMessage({ v: 1, type: "action", action: longActionName, ...payload })).not.toBeNull();
  });

  it("シリアライズできないactionペイロードを拒否する（ADR-0023）", () => {
    const circular: Record<string, unknown> = { self: undefined };
    circular.self = circular;
    expect(parseClientMessage({ v: 1, type: "action", action: "submit", loop: circular })).toBeNull();
  });

  it("既収録3本のactionはいずれも上限に触れない（ADR-0023）", () => {
    // detectives: vote / dontsayit: reportViolation 等 / ranking: proposeRanking
    const shipped = [
      { v: 1, type: "action", action: "ready" },
      { v: 1, type: "action", action: "vote", targetPlayerId: "p1234" },
      { v: 1, type: "action", action: "correct", answeredPlayerId: "p1234" },
      { v: 1, type: "action", action: "reportViolation" },
      {
        v: 1,
        type: "action",
        action: "proposeRanking",
        ranking: ["sleep", "money", "friends", "food", "work"],
      },
      { v: 1, type: "action", action: "approveRanking" },
    ];
    for (const message of shipped) {
      expect(parseClientMessage(message)).not.toBeNull();
    }
  });
});
