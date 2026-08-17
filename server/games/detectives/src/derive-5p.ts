// 5人版の機械的な導出（基本設計/06_推論エンジンと検証アルゴリズム.md「5人版の導出手順」）。
// 手順の順序が結果に影響するため、1→2→3→4の順を崩さない。
import type { Case, Character, Contradiction, Fact, Variant } from "@beb/shared-detectives";

/** 統合されて5人版に存在しなくなるキャラクターのid */
export function mergedAwayIds(base: Case): string[] {
  return base.characters.filter((character) => character.merge5p !== null).map((character) => character.id);
}

/** 5人版を導出できるか（統合指定があり、導出後の人数がplayerCountの下限を下回らない） */
export function has5p(base: Case): boolean {
  const merged = mergedAwayIds(base);
  if (merged.length === 0) {
    return false;
  }
  return base.characters.length - merged.length >= base.playerCount[0];
}

/**
 * 6人版のデータから5人版を導出する。
 *
 * 1. merge5pが非nullのキャラクターXを指定先Yへ統合する（Xは一覧から消える）
 * 2. Xが所有する事実のownerをYへ付け替える（idとvalueは変えない）
 * 3. contradictionsのrequires5pが非nullならそれをrequiresとして使う
 * 4. culpritがXであるバリアントを除外する
 */
export function derive5p(base: Case): Case {
  const mergeTargets = new Map<string, string>();
  for (const character of base.characters) {
    if (character.merge5p !== null) {
      mergeTargets.set(character.id, character.merge5p);
    }
  }

  // 手順1
  const characters: Character[] = base.characters
    .filter((character) => !mergeTargets.has(character.id))
    .map((character) => ({ ...character }));

  // 手順2
  const facts: Fact[] = base.facts.map((fact) => ({
    ...fact,
    owner: mergeTargets.get(fact.owner) ?? fact.owner,
  }));

  // 手順3・手順4
  const variants: Variant[] = base.variants
    .filter((variant) => !mergeTargets.has(variant.culprit))
    .map((variant) => ({
      ...variant,
      contradictions: variant.contradictions.map(
        (contradiction: Contradiction): Contradiction => ({
          ...contradiction,
          requires: contradiction.requires5p ?? contradiction.requires,
        }),
      ),
    }));

  return { ...base, characters, facts, variants };
}
