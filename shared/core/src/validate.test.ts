import { describe, expect, it } from "vitest";
import { parseClientMessage } from "./validate";

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
});
