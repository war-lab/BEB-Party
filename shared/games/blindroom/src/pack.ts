// お題データのスキーマ。このファイルの型定義がスキーマの正本である（基本設計/12_BLINDROOMゲームモジュール.md）。
//
// 検証は件数・一意性・文字種の計数だけで足りる。英文の意味を判定しない（不変条件1）。
// 見本の配置はコンテンツに持たない。startでseedから生成する（ADR-0024）。
import type { Level } from "@beb/shared-core";

/** 聞き手の質問に使う言い回し。アイテムの種類に依存しないためパック直下に持つ（12のコンテンツ形式） */
export interface KeyExpression {
  en: string;
  ja: string;
}

/** 盤面に置くアイテム1件 */
export interface ItemDefinition {
  /** 盤面と提出に載る識別子。長さを縛ってペイロード長の見積りを固定する（12のplace） */
  id: string;
  /** マスとパレットに出す英語名。1〜3語 */
  en: string;
  /** 意味の取り違えを防ぐ日本語名 */
  ja: string;
  /**
   * 盤面とパレットに描くアイコンのid。
   *
   * `client/public/items/blindroom/<icon>.svg` を指す（[ADR-0025](../adr/0025-盤面アイコンはSVGで持つ.md)）。
   * 絵文字を使わないのは、端末のシステムフォントで絵柄が変わると、
   * 名前が主張する属性（色）と描かれるものが食い違い、採点が卓の中で一致しなくなるためである。
   */
  icon: string;
}

/** アイコンの配信元。gameIdを含むが、eslintのgameIdリテラル検査は完全一致のみを見る */
export const ICON_BASE_PATH = "/items/blindroom";

/** アイテムのアイコンのURL */
export function iconUrl(icon: string): string {
  return `${ICON_BASE_PATH}/${icon}.svg`;
}

/** アイテムセットの難度の段。説明者のレベルで切り替える（12のレベル差の吸収） */
export type Tier = "easy" | "standard";

/** アイテムセット1件。1ラウンドで使うアイテムの母集団である */
export interface ItemSet {
  id: string;
  tier: Tier;
  /**
   * 説明者へ配る位置表現の枠。
   *
   * `standard` は修飾語が要るため使う言い回しが違う。パック直下に1組だけ置くと
   * `easy` 側に不要な語が混じるため、セットごとに持つ（12のコンテンツ形式）。
   */
  describerHints: string[];
  items: ItemDefinition[];
}

/** お題パック1本。content/blindroom/<id>.json の中身。ロビーで選ぶ単位はパックである */
export interface BlindRoomPack {
  id: string;
  title: string;
  keyExpressions: KeyExpression[];
  itemSets: ItemSet[];
}

/**
 * 1つのアイテムセットが持つアイテム数の下限。
 *
 * 5個を配置しても選ばれない候補が3件以上残る状態を作る。候補がちょうど5件だと、
 * 聞き手はアイテムの特定を考えずに配置だけを当てればよくなる（12の検証項目）。
 */
export const MIN_ITEMS = 8;

/** 1つのアイテムセットが持つ describerHints の下限。レベル1〜2へ4件渡す設計に合わせる（12の検証10） */
export const MIN_DESCRIBER_HINTS = 4;

/** パックが持つ keyExpressions の下限（12の検証12） */
export const MIN_KEY_EXPRESSIONS = 3;

/** itemIdの最大長。placeのペイロードが ACTION_MAX_CHARS に収まることを保つ（12の検証6） */
export const MAX_ITEM_ID_LENGTH = 16;

/** itemIdに使える文字。生成物のバイト列と正規表現の見積りを単純に保つ */
export const ITEM_ID_PATTERN = /^[a-z0-9_]+$/u;

/** enの最大語数。マスとパレットに収まる長さに限る（12の検証9） */
export const MAX_ITEM_WORDS = 3;

/** describerHints の空欄を表す記号。枠にアイテム名を入れて初めて文になる（12の秘密情報） */
export const HINT_BLANK = "...";

/** describerHints が空欄を含むか（完成文になっていないか） */
export function hasHintBlank(hint: string): boolean {
  return hint.includes(HINT_BLANK);
}

/** itemIdが規約（小文字英数字とアンダースコア、16文字以内）に合うか */
export function isValidItemId(id: string): boolean {
  return id.length <= MAX_ITEM_ID_LENGTH && ITEM_ID_PATTERN.test(id);
}

/** アイコンidがファイル名として使える形か。itemIdと同じ規約に揃える */
export function isValidIconId(icon: string): boolean {
  return icon.length <= MAX_ITEM_ID_LENGTH && ITEM_ID_PATTERN.test(icon);
}

/** 説明者のレベルから使うアイテムセットの段を決める（12のレベル差の吸収の第1層） */
export function tierFor(level: Level): Tier {
  return level <= 2 ? "easy" : "standard";
}

/** enの語数。半角空白で区切った要素数で数える。英語の意味は解釈しない（不変条件1） */
export function countWords(text: string): number {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized === "" ? 0 : normalized.split(" ").length;
}
