// 配役と犯人バリアントの抽選（設計.mdの配役アルゴリズム、ADR-0007）。
import type { Level, Player } from "@beb/shared-core";
import type { Character, Variant } from "@beb/shared-detectives";
import { pickOne, shuffle } from "./rng";

export interface CastMember {
  playerId: string;
  characterId: string;
  characterName: string;
  /** 配役されたプレイヤーの自己申告レベル。証言の英文レベルの決定に使う */
  level: Level;
}

/**
 * 参加者をレベル降順、キャラクターを recommendedLevel 降順に並べて対応させる。
 * 同レベル帯はシャッフルする（設計.md）。
 *
 * 人数とキャラクター数は一致している必要がある。5人版の統合は呼び出し側で先に済ませる。
 */
export function assignCast(players: Player[], characters: Character[], random: () => number): CastMember[] {
  if (players.length !== characters.length) {
    throw new Error(`参加人数(${players.length})とキャラクター数(${characters.length})が一致しない`);
  }

  const sortedPlayers = sortByLevelDesc(players, (player) => player.level, random);
  const sortedCharacters = sortByLevelDesc(characters, (character) => character.recommendedLevel, random);

  return sortedPlayers.map((player, index) => {
    const character = sortedCharacters[index] as Character;
    return {
      playerId: player.id,
      characterId: character.id,
      characterName: character.name,
      level: player.level,
    };
  });
}

/** 同レベル帯をシャッフルしたうえでレベル降順に並べる */
function sortByLevelDesc<T>(items: readonly T[], levelOf: (item: T) => Level, random: () => number): T[] {
  const byLevel = new Map<Level, T[]>();
  for (const item of items) {
    const level = levelOf(item);
    byLevel.set(level, [...(byLevel.get(level) ?? []), item]);
  }
  const levels = [...byLevel.keys()].sort((a, b) => b - a);
  return levels.flatMap((level) => shuffle(byLevel.get(level) ?? [], random));
}

/**
 * 犯人バリアントを抽選する。
 *
 * 対象は「配役されたプレイヤーの自己申告レベルが3以上」のキャラクターに限る。
 * 該当が無い場合（全員レベル1〜2の組）は、最もレベルが高いプレイヤーのキャラクターを選ぶ。
 * キャラクターの recommendedLevel ではなく実プレイヤーのレベルで判定する（ADR-0007）。
 */
export function pickCulpritVariant(cast: CastMember[], variants: Variant[], random: () => number): Variant {
  const levelOf = new Map(cast.map((member) => [member.characterId, member.level]));

  const eligible = variants.filter((variant) => (levelOf.get(variant.culprit) ?? 0) >= 3);
  const picked = pickOne(eligible, random);
  if (picked !== undefined) {
    return picked;
  }

  // 全員がレベル1〜2の組。最もレベルが高いプレイヤーのキャラクターを犯人にする。
  // 同レベルのプレイヤーが複数いる場合はその中から抽選する。先頭を固定で選ぶと、
  // 初級者だけの組で毎回同じ犯人・同じ嘘になり、リプレイ性が失われる（実測で確認）
  const topLevel = Math.max(...cast.map((member) => member.level));
  const topVariants = variants.filter((variant) => levelOf.get(variant.culprit) === topLevel);
  const fallback = pickOne(topVariants, random);

  if (fallback === undefined) {
    throw new Error("配役されたキャラクターに対応するバリアントが1つも無い");
  }
  return fallback;
}
