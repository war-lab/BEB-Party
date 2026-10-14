// 検証用の文例集（基本設計/14の「検証用の文例集」）。
//
// 文例集はパックではないため content/secretrule/ の直下に置かない。パックの読み込み（インデックスの生成、
// validate:content、フォントサブセットの生成）は直下の *.json だけを読む。
// validate:content はパックを1ファイルずつ検証関数へ渡すため、文例集はここで直接importする。
// validateContent は GameModule の一部であり、文例集はWorkerのバンドルに入る（60件程度で大きさは問題にならない）。
import corpusJson from "../../../../content/secretrule/corpus/sentences.json";

export interface Corpus {
  sentences: string[];
}

/** 文例集の生の値。形の検査は validate-content.ts の検証8が行う */
export const CORPUS: unknown = corpusJson;

/** 文例集を読む。形が壊れていれば null を返す */
export function readCorpus(value: unknown): Corpus | null {
  if (typeof value !== "object" || value === null || !("sentences" in value)) {
    return null;
  }
  const sentences = (value as { sentences: unknown }).sentences;
  if (!Array.isArray(sentences) || !sentences.every((entry) => typeof entry === "string")) {
    return null;
  }
  return { sentences: sentences as string[] };
}
