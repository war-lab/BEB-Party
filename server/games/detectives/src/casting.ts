// 配役と犯人バリアントの抽選（設計.mdの配役アルゴリズム、ADR-0007）。
import type { Level, Player } from "@beb/shared-core";
import type { Character, Variant } from "@beb/shared-detectives";
import { pickWeighted, shuffle } from "./rng";

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

/** レベル3以上のプレイヤーに与える抽選の重み（ADR-0016） */
const PREFERRED_CULPRIT_LEVEL = 3;
const PREFERRED_WEIGHT = 3;

/**
 * 犯人バリアントを抽選する。
 *
 * 配役されたプレイヤーのレベルが3以上のキャラクターを3倍の重みで引く。
 * キャラクターの recommendedLevel ではなく実プレイヤーのレベルで判定する（ADR-0016）。
 *
 * 候補を「レベル3以上」に絞り込まないのは、レベルが公開状態に載るためである。
 * 絞り込むと、レベル3以上が1人しかいない卓で犯人が確定し、開始前に全員へ割れる。
 */
export function pickCulpritVariant(cast: CastMember[], variants: Variant[], random: () => number): Variant {
  const levelOf = new Map(cast.map((member) => [member.characterId, member.level]));

  // 配役されたキャラクターのバリアントだけを対象にする（5人版で除外されたバリアントを引かない）
  const candidates = variants.filter((variant) => levelOf.has(variant.culprit));
  const picked = pickWeighted(
    candidates,
    (variant) => ((levelOf.get(variant.culprit) ?? 1) >= PREFERRED_CULPRIT_LEVEL ? PREFERRED_WEIGHT : 1),
    random,
  );

  if (picked === undefined) {
    throw new Error("配役されたキャラクターに対応するバリアントが1つも無い");
  }
  return picked;
}
