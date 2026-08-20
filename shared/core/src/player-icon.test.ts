import { describe, expect, it } from "vitest";
import { PLAYER_ICONS, fallbackPlayerIconId, isPlayerIconId, playerIconEmoji } from "./player-icon";

describe("プレイヤーアイコン", () => {
  it("選択肢は30件で、IDと絵文字が重複しない", () => {
    expect(PLAYER_ICONS).toHaveLength(30);
    expect(new Set(PLAYER_ICONS.map((icon) => icon.id)).size).toBe(30);
    expect(new Set(PLAYER_ICONS.map((icon) => icon.emoji)).size).toBe(30);
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

  it("未知のIDでも絵文字を返す（表示を欠落させない）", () => {
    expect(playerIconEmoji("fox")).toBe("🦊");
    expect(playerIconEmoji("unknown-id")).toBe(PLAYER_ICONS[0].emoji);
  });
});
