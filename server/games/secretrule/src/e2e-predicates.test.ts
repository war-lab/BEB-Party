// E2Eの判定の写し（e2e/support/secretrule-predicates.ts）が rules.ts と一致することを確かめる。
//
// e2eはワークスペースのパッケージに依存しないため判定を写して持つ。写しがずれると、E2Eは誤った推理で
// 規則を絞り、判定関数の誤りも写しの誤りも見逃す。収録パック basic の候補について、在庫と文例集と
// 境界の英文で両者の結果を突き合わせる。
import { normalizeSubmission, type RuleSpec, type SecretRulePack } from "@beb/shared-secretrule";
import { describe, expect, it } from "vitest";
import basicJson from "../../../../content/secretrule/basic.json";
// e2e/ はこのパッケージの rootDir の外にあり、tsc は rootDir 外のファイルの import を拒否する（TS6059）。
// 判定の写しを1か所に保つため、この import だけ型検査から外す。実行時の解決は vitest が行う
// TS6059 はファイル全体の組み立てに対する診断で、@ts-expect-error では「未使用」と判定される。@ts-ignore を使う
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS6059（rootDir の外）
import { BANK, PREDICATES } from "../../../../e2e/support/secretrule-predicates";
import { CORPUS, readCorpus } from "./corpus";
import { satisfies } from "./rules";

const pack = basicJson as SecretRulePack;
const bank = BANK as string[];
const predicates = PREDICATES as Record<string, (text: string) => boolean>;

const BOUNDARY = [
  '"Is it fun?" he asked.',
  "(It is fun!)",
  "... Is it fun?",
  "I couldn't find it.",
  "It is a well-known song.",
  "Today, then, I have 8 books.",
  "Do you like the black-and-white cat?",
];

describe("E2Eの判定の写し", () => {
  it("basic の全候補に写しがある", () => {
    for (const candidate of pack.candidates) {
      expect(predicates[candidate.id], candidate.id).toBeTypeOf("function");
    }
  });

  it("在庫・文例集・境界の英文で、写しと rules.ts の結果が一致する", () => {
    const sentences = [...bank, ...(readCorpus(CORPUS)?.sentences ?? []), ...BOUNDARY].map((text) =>
      normalizeSubmission(text),
    );
    for (const candidate of pack.candidates) {
      const spec = { ruleId: candidate.ruleId, params: candidate.params } as RuleSpec;
      for (const text of sentences) {
        expect(predicates[candidate.id]!(text), `${candidate.id}: ${text}`).toBe(satisfies(spec, text));
      }
    }
  });
});
