// 禁止語どうしの「同じ語とみなす関係」を表で持つ。検証14・16・17が参照する。
//
// 文字列比較だけでは判定できない関係を、明示した表として置く場所である。
// 推論はしない（05のランタイム方針とは無関係だが、検証も同じ理由で表に寄せる）。
//
// この表が不完全であることは前提とする。
// 検証14と16はエラー、検証17は警告とするのはそのためである（09の検証項目）。

/**
 * 規則的な派生を作る接尾辞。
 *
 * 単複差の `s` / `es` は検証13が担当するためここには置かない。
 * `-est` `-er` を入れているのは `small` と `smallest`、`low` と `lowest` を捕まえるためである（実測）。
 */
const DERIVATION_SUFFIXES = [
  "ish",
  "ian",
  "ean",
  "ese",
  "ness",
  "less",
  "ful",
  "dom",
  "ing",
  "est",
  "ed",
  "er",
  "ly",
  "al",
  "ic",
  "an",
  "y",
];

/**
 * 派生とみなす最短の語幹。
 *
 * 3文字以下を語幹として扱うと `art` と `artist` のような別概念まで落ちる一方、
 * `use` と `used` のような無害な対も落ちる。4文字を下限にした根拠は
 * 実データで `stick`/`sticky` `free`/`freedom` `unity`/`unite` `give`/`giving` を捕まえ、
 * かつ誤検出が出なかったことである（573枚で実測）。
 */
const MIN_DERIVATION_STEM = 4;

/**
 * 文字列比較では判定できない対。片方を禁止すればもう片方も言えない。
 *
 * 09の「禁止語の語形変化」は `France` と `French` を同じ語として扱うと定めている。
 * 規則変化はDERIVATION_SUFFIXESが拾うが、国名と国民形容詞・短縮形は拾えない。
 */
const IRREGULAR_SAME_WORD: readonly (readonly [string, string])[] = [
  // 国名と国民形容詞
  ["france", "french"],
  ["spain", "spanish"],
  ["greece", "greek"],
  ["britain", "british"],
  ["denmark", "danish"],
  ["poland", "polish"],
  ["scotland", "scottish"],
  ["ireland", "irish"],
  ["turkey", "turkish"],
  ["sweden", "swedish"],
  ["finland", "finnish"],
  ["netherlands", "dutch"],
  ["wales", "welsh"],
  ["china", "chinese"],
  ["japan", "japanese"],
  ["korea", "korean"],
  ["portugal", "portuguese"],
  ["norway", "norwegian"],
  ["russia", "russian"],
  ["germany", "german"],
  ["italy", "italian"],
  ["egypt", "egyptian"],
  ["india", "indian"],
  // 短縮形。話し手はどちらでも同じものを指す
  ["photograph", "photo"],
  ["bicycle", "bike"],
  ["mathematics", "math"],
  ["refrigerator", "fridge"],
  ["television", "tv"],
  ["airplane", "plane"],
  ["telephone", "phone"],
  ["advertisement", "ad"],
  ["laboratory", "lab"],
  ["examination", "exam"],
  ["gymnasium", "gym"],
  ["influenza", "flu"],
  ["umbrella", "brolly"],
];

/**
 * 英式綴りと米式綴り。禁止語は米式に統一する。
 *
 * 統一する理由は、監視役が禁止語の一覧を目で見て「言ったか」を判定するためである。
 * 同じ語がカードごとに違う綴りで並ぶと、判定の基準がぶれる。
 * 米式を正とするのは、日本の学校英語が米式で教えられており卓の多数がそちらを想起するためである。
 */
const BRITISH_TO_AMERICAN: Readonly<Record<string, string>> = {
  grey: "gray",
  moustache: "mustache",
  colour: "color",
  colours: "colors",
  coloured: "colored",
  theatre: "theater",
  harbour: "harbor",
  organisation: "organization",
  organise: "organize",
  litre: "liter",
  metre: "meter",
  centre: "center",
  favourite: "favorite",
  neighbour: "neighbor",
  labour: "labor",
  honour: "honor",
  humour: "humor",
  flavour: "flavor",
  jewellery: "jewelry",
  pyjamas: "pajamas",
  aeroplane: "airplane",
  defence: "defense",
  licence: "license",
  practise: "practice",
  travelling: "traveling",
  cancelled: "canceled",
  aluminium: "aluminum",
  plough: "plow",
  storey: "story",
  tyre: "tire",
  kerb: "curb",
  sceptical: "skeptical",
  analyse: "analyze",
  realise: "realize",
  recognise: "recognize",
  apologise: "apologize",
};

/**
 * 説明の同じ経路を塞ぐ語の組。片方を禁止すればもう片方を言う理由がほぼ無い。
 *
 * 検証14と違い、これは言語規則ではなく意味の判断である。
 * 卓によっては別の語として使い分ける余地があるため、警告にとどめる（09の検証17）。
 * 表は網羅ではない。追加は実データで重複が見つかった都度おこなう。
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["movie", "movies", "film", "films", "cinema"],
  ["soccer", "football"],
  ["hot", "warm"],
  ["cold", "chilly"],
  ["noisy", "loud"],
  ["quiet", "silent"],
  // `comic` は入れない。漫画を指す名詞として使われるため `funny` の言い換えとは限らない
  ["funny", "silly"],
  ["smart", "clever", "bright"],
  // `great` は `Alexander the Great` `Great Barrier Reef` のように正解名の一部で現れるため入れない
  ["big", "large", "huge", "giant"],
  ["small", "little", "tiny"],
  ["rich", "wealthy"],
  ["money", "cash"],
  ["cart", "trolley"],
  ["line", "queue"],
  ["package", "parcel"],
  ["bill", "note", "banknote"],
  ["ape", "gorilla"],
  ["hat", "cap"],
  ["talk", "talks", "speak", "speaks", "say", "says"],
  ["director", "filmmaker"],
  ["cut", "trim"],
  ["metal", "steel", "iron"],
  ["join", "bind", "attach"],
  ["mystery", "unknown", "puzzle"],
  ["ancient", "prehistoric", "old"],
  ["ocean", "sea"],
  ["sing", "sings", "singer", "song", "songs"],
  ["prize", "award", "nobel"],
  ["author", "writer", "novelist"],
  ["book", "books", "novel", "novels"],
  ["doctor", "physician"],
  ["shop", "shops", "store", "stores"],
  ["kid", "kids", "child", "children"],
  ["sleep", "sleeps", "nap"],
  ["lazy", "idle"],
  ["fast", "quick", "rapid"],
  ["strong", "powerful"],
  ["war", "battle", "fight"],
  // `king` と `queen` は入れない。片方を禁じてももう片方は別の人物を指して言えるため、枠は死なない
  ["freedom", "liberty"],
  ["give", "gives", "donate"],
  ["fill", "refill"],
  ["press", "push"],
  ["begin", "start"],
  ["make", "makes", "create", "build"],
  ["beautiful", "pretty", "lovely"],
  ["scary", "frightening", "creepy"],
];

const SYNONYM_OF = new Map<string, number>();
for (const [index, group] of SYNONYM_GROUPS.entries()) {
  for (const word of group) {
    SYNONYM_OF.set(word, index);
  }
}

const IRREGULAR_OF = new Map<string, Set<string>>();
for (const [a, b] of IRREGULAR_SAME_WORD) {
  if (!IRREGULAR_OF.has(a)) {
    IRREGULAR_OF.set(a, new Set());
  }
  if (!IRREGULAR_OF.has(b)) {
    IRREGULAR_OF.set(b, new Set());
  }
  IRREGULAR_OF.get(a)?.add(b);
  IRREGULAR_OF.get(b)?.add(a);
}

/**
 * 2語が規則的な派生の関係にあるか。
 *
 * 短いほうを語幹として、接尾辞を足した形が長いほうと一致するかを見る。
 * 語末の `e` の脱落（`give` と `giving`）、`y` から `i` への交替（`happy` と `happiest`）、
 * 子音の重複（`big` と `bigger`）を扱う。
 */
export function isDerivedForm(a: string, b: string): boolean {
  const [stem, derived] = a.length <= b.length ? [a, b] : [b, a];
  if (stem === derived || stem.length < MIN_DERIVATION_STEM) {
    return false;
  }
  const lastChar = stem.slice(-1);
  const bases = [
    stem,
    stem.endsWith("e") ? stem.slice(0, -1) : null,
    stem.endsWith("y") ? `${stem.slice(0, -1)}i` : null,
    `${stem}${lastChar}`,
  ].filter((base): base is string => base !== null);

  return DERIVATION_SUFFIXES.some((suffix) => bases.some((base) => derived === `${base}${suffix}`));
}

/** 表に載せた不規則な対か。国名と国民形容詞・短縮形を扱う */
export function isIrregularSameWord(a: string, b: string): boolean {
  return IRREGULAR_OF.get(a)?.has(b) === true;
}

/** 英式綴りなら米式綴りを返す。米式または表に無い語ならundefinedを返す */
export function americanSpellingOf(word: string): string | undefined {
  return BRITISH_TO_AMERICAN[word];
}

/** 同じ説明経路を塞ぐ語の組に属するか。属さない語、または別の組ならfalse */
export function isSynonym(a: string, b: string): boolean {
  if (a === b) {
    return false;
  }
  const group = SYNONYM_OF.get(a);
  return group !== undefined && group === SYNONYM_OF.get(b);
}
