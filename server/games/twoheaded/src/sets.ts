// バンドルしたお題セットへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// お題セットの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { TwoHeadedSet, TwoHeadedSetSummary } from "@beb/shared-twoheaded";
import { setJsons } from "./sets.generated";

export const SETS: TwoHeadedSet[] = setJsons as TwoHeadedSet[];

export function findSet(setId: string): TwoHeadedSet | undefined {
  return SETS.find((entry) => entry.id === setId);
}

/** ロビーへ配る公開メタ情報。お題・書き出し・言い回しを含めない（16のカタログ、ADR-0003） */
export function summarize(target: TwoHeadedSet): TwoHeadedSetSummary {
  return { id: target.id, title: target.title, cardCount: target.cards.length };
}
