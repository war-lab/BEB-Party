// 事件データのスキーマ。このファイルの型定義がスキーマの正本である（基本設計/04_事件データと検証.md）。
// 表示テキストと推理の骨格を分離し、骨格（value / requires / yields）だけを機械検証の対象とする。
import type { Level } from "@beb/shared-core";

/** レベル1〜5すべての英文。配役は相対的な割り当てのため、全レベルを必須とする（ADR-0007） */
export type LevelText = Record<`${Level}`, string>;

/** 証言の開示条件。free = 自発的に話してよい / on_question_only = 質問されたときだけ答える */
export type Disclosure = "free" | "on_question_only";

export interface Character {
  id: string;
  /** 表示名。役割の説明を括弧で添える（例: "Aoi (part-time staff)"） */
  name: string;
  recommendedLevel: Level;
  /** 5人版で統合される先のキャラクターid。統合されない場合はnull */
  merge5p: string | null;
}

export interface Fact {
  id: string;
  /** 所有するキャラクターのid */
  owner: string;
  /** 検証用の構造化値。推論エンジンはこの文字列を解釈せず、不透明な識別子として扱う */
  value: string;
  disclosure: Disclosure;
  text: LevelText;
  /** 語義のみ。文全体の和訳は書かない（04の追加リント） */
  hintJa: string;
}

/** 犯人の正直な証言1枚を差し替える嘘。v1スキーマでは1バリアントにつき1枚に限る（04） */
export interface Lie {
  /** 差し替える対象のfact id。犯人が所有する事実でなければならない */
  replaces: string;
  value: string;
  text: LevelText;
  hintJa: string;
}

/**
 * 矛盾定義。推論エンジンの規則に対応する。
 *
 * `requires` にはそのバリアントの嘘fact（`lie.replaces` が指すid）を必ず含める（ADR-0008）。
 */
export interface Contradiction {
  /** fact idの配列。他の矛盾の `yields` を含めてもよい（多段推論） */
  requires: string[];
  /** 5人版での上書き。nullなら `requires` をそのまま使う（04の5人版の扱い） */
  requires5p: string[] | null;
  /** 導かれる結論のシンボル。fact idと衝突しない名前にする */
  yields: string;
  meaningJa: string;
}

export interface Variant {
  /** 犯人のキャラクターid */
  culprit: string;
  lie: Lie;
  contradictions: Contradiction[];
}

export interface KeyExpression {
  en: string;
  ja: string;
}

export interface Reveal {
  /** 真相タイムライン。レベル3相当の平易な英文で書く */
  timelineEn: string[];
  keyExpressions: KeyExpression[];
}

export interface Case {
  /** ファイル名スラッグ + バージョン（例: cafe_theft_v1） */
  id: string;
  /** 対応人数。[最小, 最大] */
  playerCount: [number, number];
  title: string;
  briefing: { ja: string; en: string };
  characters: Character[];
  facts: Fact[];
  /** 犯人候補ごとのバリアント。原則キャラクター数と同数（04の追加リント） */
  variants: Variant[];
  reveal: Reveal;
}

/** 検証・配役で扱う人数版 */
export type PlayerCountVariant = "6p" | "5p";
