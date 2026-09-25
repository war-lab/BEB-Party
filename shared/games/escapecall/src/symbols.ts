// 錠に描く記号（基本設計/13_ESCAPECALLゲームモジュール.md の記号）。
//
// 記号は色4種と形4種の組み合わせで16種とする。描画（塗り）と名前（英語・日本語）を同じ定義から出す。
// 別々に持つと、画面の色と規則の文の色名が食い違う（13のコンテンツ形式）。

/**
 * 色。ADR-0025の5色から白を除いた4色。
 * 5色は色覚特性（2型・1型）でも分離する組み合わせであり、赤と緑を同時に使わない。
 * 白を除くのは、画面の地が白に近く輪郭しか見えないためである（13の記号）。
 */
export const COLORS = {
  red: { en: "red", ja: "赤", fill: "#FF3D3D" },
  blue: { en: "blue", ja: "青", fill: "#2E7CF6" },
  yellow: { en: "yellow", ja: "黄", fill: "#FFC400" },
  black: { en: "black", ja: "黒", fill: "#161B33" },
} as const;

/** 形。色が無くても区別できる4種。どれも s を付ければ複数形になる語として選んでいる */
export const SHAPES = {
  star: { en: "star", ja: "星" },
  circle: { en: "circle", ja: "円" },
  triangle: { en: "triangle", ja: "三角" },
  square: { en: "square", ja: "四角" },
} as const;

export type ColorId = keyof typeof COLORS;
export type ShapeId = keyof typeof SHAPES;

export const COLOR_IDS = Object.keys(COLORS) as ColorId[];
export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[];

/** 記号のid。`<色>_<形>`（例: red_star） */
export type SymbolId = `${ColorId}_${ShapeId}`;

export const SYMBOL_IDS: SymbolId[] = COLOR_IDS.flatMap((color) =>
  SHAPE_IDS.map((shape) => `${color}_${shape}` as SymbolId),
);

export function symbolIdOf(color: ColorId, shape: ShapeId): SymbolId {
  return `${color}_${shape}`;
}

export function colorOf(symbol: SymbolId): ColorId {
  return symbol.split("_")[0] as ColorId;
}

export function shapeOf(symbol: SymbolId): ShapeId {
  return symbol.split("_")[1] as ShapeId;
}

export function isSymbolId(value: unknown): value is SymbolId {
  return typeof value === "string" && (SYMBOL_IDS as string[]).includes(value);
}

/** 記号の英語名（例: red star）。振り返りの表示にだけ使う。解いている間の画面には名前を出さない（13の記号） */
export function symbolNameEn(symbol: SymbolId): string {
  return `${COLORS[colorOf(symbol)].en} ${SHAPES[shapeOf(symbol)].en}`;
}

/** 記号の日本語名（例: 赤い星ではなく「赤の星」）。振り返りの表示にだけ使う */
export function symbolNameJa(symbol: SymbolId): string {
  return `${COLORS[colorOf(symbol)].ja}の${SHAPES[shapeOf(symbol)].ja}`;
}
