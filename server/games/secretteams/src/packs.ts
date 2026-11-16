// バンドルしたテーマパックへのアクセス（基本設計/01のコンテンツの読み込み）。
//
// テーマパックの整合性はCIの pnpm validate:content が保証するため、ランタイムでは再検証しない
// （検証をランタイムのコードパスに置かない。基本設計/05）。
import type { SecretTeamsPack, SecretTeamsPackSummary } from "@beb/shared-secretteams";
import { packJsons } from "./packs.generated";

export const PACKS: SecretTeamsPack[] = packJsons as SecretTeamsPack[];

export function findPack(packId: string): SecretTeamsPack | undefined {
  return PACKS.find((entry) => entry.id === packId);
}

/** ロビーへ配る公開メタ情報。テーマと単語を含めない（17のカタログ） */
export function summarize(target: SecretTeamsPack): SecretTeamsPackSummary {
  return { id: target.id, title: target.title };
}
