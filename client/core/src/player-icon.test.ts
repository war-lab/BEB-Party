// PLAYER_ICONSの全IDに対応する画像が client/public/player-icons/ にあることを確認する。
// IDを増やしたときの画像の追加漏れ、画像を消したときのID残りを検知する（ADR-0022）。
//
// ファイル一覧はViteのimport.meta.globで取る。client/coreはブラウザ向けのパッケージであり、
// node:fsを使うとNodeの型をこのパッケージ全体へ持ち込むことになるため使わない
import { describe, expect, it } from "vitest";
import { PLAYER_ICONS } from "@beb/shared-core";
import { playerIconImage } from "./player-icon";

const files = import.meta.glob("../../public/player-icons/*.png");
const assetIds = Object.keys(files).map((file) => file.replace(/^.*\/(.+)\.png$/, "$1"));

describe("プレイヤーアイコンの画像", () => {
  it("IDから引いたURLと実ファイルが対応する", () => {
    for (const icon of PLAYER_ICONS) {
      expect(playerIconImage(icon.id)?.src).toBe(`/player-icons/${icon.id}.png`);
      expect(assetIds, `${icon.id}.png が無い`).toContain(icon.id);
    }
  });

  it("一覧に無いPNGが残っていない", () => {
    const ids = new Set<string>(PLAYER_ICONS.map((icon) => icon.id));
    expect(assetIds.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("一覧に無いIDはnullを返す", () => {
    expect(playerIconImage("unknown-id")).toBeNull();
    expect(playerIconImage(undefined)).toBeNull();
  });
});
