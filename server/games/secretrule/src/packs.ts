// バンドルした規則パックへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// 規則パックの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { SecretRulePack, SecretRulePackSummary } from "@beb/shared-secretrule";
import { packJsons } from "./packs.generated";

export const PACKS: SecretRulePack[] = packJsons as SecretRulePack[];

export function findPack(packId: string): SecretRulePack | undefined {
  return PACKS.find((entry) => entry.id === packId);
}

/** ロビーへ配る公開メタ情報。候補の母集団を含めない（14のカタログ） */
export function summarize(target: SecretRulePack): SecretRulePackSummary {
  return { id: target.id, title: target.title };
}
