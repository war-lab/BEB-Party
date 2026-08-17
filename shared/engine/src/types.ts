// 汎用前方推論エンジンのデータモデル（基本設計/06_推論エンジンと検証アルゴリズム.md）。
// エンジンが扱うのは不透明な文字列シンボルと規則だけであり、シンボルの構造（等号・時刻・場所）を解釈しない。

/** 規則: 前提がすべて揃えば結論を1つ導く */
export interface Rule {
  id: string;
  requires: string[];
  yields: string;
}

/** 到達集合の計算結果 */
export interface Saturation {
  /** 到達したシンボル（initialを含む） */
  reached: Set<string>;
  /** 発火した規則のid。並び順は評価順に依存するため、表示前に整列する */
  fired: string[];
  /** シンボル -> それを導いた規則のrequires。initial由来のシンボルは含まない */
  support: Map<string, string[]>;
}

/** 入力データの異常（自己参照規則・反復上限超過）。呼び出し側は検証エラーとして扱う */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}
