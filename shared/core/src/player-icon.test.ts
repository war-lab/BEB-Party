import { describe, expect, it } from "vitest";
import { PLAYER_ICONS, fallbackPlayerIconId, isPlayerIconId, playerIconLabel } from "./player-icon";

describe("プレイヤーアイコン", () => {
  it("選択肢は30件で、IDと名称が重複しない", () => {
    expect(PLAYER_ICONS).toHaveLength(30);
    expect(new Set(PLAYER_ICONS.map((icon) => icon.id)).size).toBe(30);
    expect(new Set(PLAYER_ICONS.map((icon) => icon.labelJa)).size).toBe(30);
  });

  it("IDは英小文字とハイフンのみとする（stateとURLに載せても壊れない形に限る）", () => {
    for (const icon of PLAYER_ICONS) {
      expect(icon.id).toMatch(/^[a-z-]+$/);
      expect(icon.labelJa.length).toBeGreaterThan(0);
    }
  });

  it("一覧に無いIDを拒否する", () => {
    expect(isPlayerIconId("cat")).toBe(true);
    expect(isPlayerIconId("cat ")).toBe(false);
    expect(isPlayerIconId("")).toBe(false);
    expect(isPlayerIconId(undefined)).toBe(false);
    expect(isPlayerIconId(0)).toBe(false);
  });

  it("フォールバックは同じseedで同じIDを返し、一覧内のIDになる", () => {
    const ids = ["p1", "p2", "abcdef", ""].map((seed) => fallbackPlayerIconId(seed));
    for (const id of ids) {
      expect(isPlayerIconId(id)).toBe(true);
    }
    expect(fallbackPlayerIconId("p1")).toBe(fallbackPlayerIconId("p1"));
  });

  it("未知のIDでも名称を返す（読み上げを欠落させない）", () => {
    expect(playerIconLabel("fox")).toBe("きつね");
    expect(playerIconLabel("unknown-id")).toBe(PLAYER_ICONS[0].labelJa);
  });
});
