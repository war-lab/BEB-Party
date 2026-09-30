// BLIND ROOMの盤面アイコン（SVG）を生成する（ADR-0025）。
//
// 形状の定義はここが正本である。色違いは同じパス定義の %COLOR% を差し替えて作るため、
// 「色以外が完全に同一」が構造的に保証される（20点を手で持つと、同じ形の3ファイルを
// 人手で揃えることになる）。
//
// 生成物（client/public/items/blindroom/*.svg）はコミットし、CIで再生成との差分を検査する。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
// client/games/<gameId> から client/public/items/<gameId> を導く。gameIdリテラルは書かない（07の検査3）
const gameId = path.basename(packageDir);
const OUT = path.join(packageDir, "..", "..", "public", "items", gameId);

const INK = "#161B33";
const WHITE = "#F7F8FD";
const COLORS = { red: "#FF3D3D", blue: "#2E7CF6", yellow: "#FFC400", white: WHITE, black: INK };

// 共通の描画属性。輪郭は太く均一にし、44pxでも輪郭が残るようにする
const G = `fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;

// 形状。%COLOR% がアイテムの色に置き換わる唯一の箇所
const SHAPES = {
  // 閉じた本を正面から。左に暗い背表紙、右に白い小口
  book: `
  <rect x="14" y="12" width="36" height="40" rx="4" fill="%COLOR%"/>
  <rect x="14" y="12" width="9" height="40" fill="${INK}"/>
  <rect x="43" y="17" width="6" height="30" rx="2" fill="${WHITE}"/>
  <rect x="14" y="12" width="36" height="40" rx="4"/>`,

  // 取っ手つきのマグカップを真横から
  cup: `
  <path d="M22 20 H44 L41 47 Q40 52 35 52 H31 Q26 52 25 47 Z" fill="%COLOR%"/>
  <path d="M44 26 Q54 28 54 34 Q54 40 44 42"/>
  <path d="M22 20 H44 L41 47 Q40 52 35 52 H31 Q26 52 25 47 Z"/>
  <ellipse cx="33" cy="20" rx="11" ry="4" fill="${WHITE}"/>
  <ellipse cx="33" cy="20" rx="11" ry="4"/>`,

  // 縫い目のあるボール
  ball: `
  <circle cx="32" cy="32" r="19" fill="%COLOR%"/>
  <circle cx="32" cy="32" r="19"/>
  <path d="M18 21 Q32 30 46 21"/>
  <path d="M18 43 Q32 34 46 43"/>`,

  // 背もたれつきの椅子を真横から
  chair: `
  <rect x="17" y="9" width="9" height="29" rx="4" fill="%COLOR%"/>
  <rect x="17" y="34" width="30" height="9" rx="4" fill="%COLOR%"/>
  <rect x="17" y="9" width="9" height="29" rx="4"/>
  <rect x="17" y="34" width="30" height="9" rx="4"/>
  <path d="M21 43 V54"/>
  <path d="M43 43 V54"/>`,

  // 傘つきのテーブルランプ。着色するのは傘だけで、支柱と台座は共通
  lamp: `
  <path d="M23 12 H41 L50 30 H14 Z" fill="%COLOR%"/>
  <path d="M23 12 H41 L50 30 H14 Z"/>
  <rect x="29" y="30" width="6" height="17" fill="${INK}"/>
  <rect x="19" y="46" width="26" height="7" rx="3" fill="${INK}"/>
  <rect x="19" y="46" width="26" height="7" rx="3"/>`,

  // 座った猫の全身。顔は描かずシルエットで見せる
  cat: `
  <path d="M23 53 Q21 32 32 30 Q43 32 41 53 Z" fill="%COLOR%"/>
  <circle cx="32" cy="23" r="11" fill="%COLOR%"/>
  <path d="M24 15 L21 6 L30 11 Z" fill="%COLOR%"/>
  <path d="M40 15 L43 6 L34 11 Z" fill="%COLOR%"/>
  <path d="M41 51 Q53 52 50 39"/>
  <path d="M23 53 Q21 32 32 30 Q43 32 41 53 Z"/>
  <circle cx="32" cy="23" r="11"/>
  <path d="M24 15 L21 6 L30 11 Z"/>
  <path d="M40 15 L43 6 L34 11 Z"/>`,

  // 座った犬。胴体と頭は猫と同じ構成にし、耳（垂れ耳）・鼻先・尻尾だけを変える。
  // 形まで同一にはしない。easyは1語で指すセットであり、色だけの差にすると
  // 「猫＝黒 / 犬＝黄」を暗記させることになる（絵文字版で潰した名前と絵柄の不一致に戻る）
  dog: `
  <path d="M23 53 Q21 32 32 30 Q43 32 41 53 Z" fill="%COLOR%"/>
  <path d="M22 16 Q13 20 16 31 Q24 33 26 23 Z" fill="%COLOR%"/>
  <path d="M42 16 Q51 20 48 31 Q40 33 38 23 Z" fill="%COLOR%"/>
  <circle cx="32" cy="23" r="11" fill="%COLOR%"/>
  <ellipse cx="32" cy="29" rx="7" ry="5" fill="${WHITE}"/>
  <path d="M41 51 Q51 49 50 42"/>
  <path d="M23 53 Q21 32 32 30 Q43 32 41 53 Z"/>
  <path d="M22 16 Q13 20 16 31 Q24 33 26 23 Z"/>
  <path d="M42 16 Q51 20 48 31 Q40 33 38 23 Z"/>
  <circle cx="32" cy="23" r="11"/>
  <ellipse cx="32" cy="29" rx="7" ry="5"/>`,

  // 昔ながらの鍵。歯を大きく取り、32pxでも輪郭に凹凸が残るようにする
  key: `
  <circle cx="20" cy="32" r="13" fill="%COLOR%"/>
  <path d="M32 27 H54 V37 H48 V31 H42 V37 H32 Z" fill="%COLOR%"/>
  <circle cx="20" cy="32" r="13"/>
  <path d="M32 27 H54 V37 H48 V31 H42 V37 H32 Z"/>
  <circle cx="20" cy="32" r="5" fill="${WHITE}"/>
  <circle cx="20" cy="32" r="5"/>`,

  // 丸い置き時計。文字は描かず針だけにする
  clock: `
  <circle cx="32" cy="30" r="19" fill="%COLOR%"/>
  <circle cx="32" cy="30" r="19"/>
  <path d="M32 30 V19"/>
  <path d="M32 30 H41"/>
  <path d="M19 45 L14 53"/>
  <path d="M45 45 L50 53"/>`,

  // 鉢植え。鉢だけを着色し、葉は共通の暗色にする
  plant: `
  <path d="M31 40 Q17 33 20 18 Q32 21 32 40 Z" fill="${INK}"/>
  <path d="M33 40 Q47 33 44 18 Q32 21 32 40 Z" fill="${INK}"/>
  <ellipse cx="32" cy="20" rx="5" ry="11" fill="${INK}"/>
  <path d="M21 38 H43 L40 54 H24 Z" fill="%COLOR%"/>
  <path d="M21 38 H43 L40 54 H24 Z"/>`,

  // 以下は「公園」パックの形状

  // 丸い樹冠と幹の木。樹冠だけを着色し、幹は共通の暗色にする。
  // 樹冠の下端を平らにするときのこに見えるため、下端も丸く波打たせる
  tree: `
  <path d="M29 56 V36 M35 56 V36 M24 56 H40"/>
  <path d="M32 42 L24 36 M32 42 L40 36"/>
  <path d="M20 40 Q8 38 10 28 Q6 16 18 14 Q22 4 32 6 Q44 4 46 14 Q58 16 54 28 Q56 38 44 40 Q38 44 32 40 Q26 44 20 40 Z" fill="%COLOR%"/>
  <path d="M20 40 Q8 38 10 28 Q6 16 18 14 Q22 4 32 6 Q44 4 46 14 Q58 16 54 28 Q56 38 44 40 Q38 44 32 40 Q26 44 20 40 Z"/>`,

  // 背板と座面が横板のベンチを正面から
  bench: `
  <rect x="10" y="14" width="44" height="10" rx="2" fill="%COLOR%"/>
  <rect x="8" y="32" width="48" height="9" rx="2" fill="%COLOR%"/>
  <rect x="10" y="14" width="44" height="10" rx="2"/>
  <rect x="8" y="32" width="48" height="9" rx="2"/>
  <path d="M16 24 V32"/>
  <path d="M48 24 V32"/>
  <path d="M14 41 V53"/>
  <path d="M50 41 V53"/>`,

  // 横向きの小鳥。くちばしは黄に固定する
  bird: `
  <path d="M16 34 L5 27 L8 42 Z" fill="%COLOR%"/>
  <ellipse cx="29" cy="37" rx="16" ry="11" fill="%COLOR%"/>
  <circle cx="43" cy="24" r="9" fill="%COLOR%"/>
  <path d="M51 21 L60 25 L51 29 Z" fill="${COLORS.yellow}"/>
  <path d="M16 34 L5 27 L8 42 Z"/>
  <ellipse cx="29" cy="37" rx="16" ry="11"/>
  <circle cx="43" cy="24" r="9"/>
  <path d="M51 21 L60 25 L51 29 Z"/>
  <path d="M20 36 Q28 42 36 36"/>
  <circle cx="45" cy="22" r="2" fill="${INK}"/>
  <path d="M26 48 V56"/>
  <path d="M33 48 V56"/>`,

  // ひし形の凧。骨組みの十字と、蝶結びつきの尻尾
  kite: `
  <path d="M30 4 L48 22 L30 44 L12 22 Z" fill="%COLOR%"/>
  <path d="M30 4 L48 22 L30 44 L12 22 Z"/>
  <path d="M30 4 V44"/>
  <path d="M12 22 H48"/>
  <path d="M30 44 Q40 48 36 54 Q32 60 44 60"/>
  <path d="M34 48 L42 46 L40 53 Z" fill="${INK}"/>`,

  // 5枚の花びらの花。花びらだけを着色し、芯は黄に固定する
  flower: `
  <path d="M32 34 V56"/>
  <path d="M32 48 Q22 40 18 46 Q24 54 32 50"/>
  <circle cx="32" cy="12" r="8" fill="%COLOR%"/>
  <circle cx="43" cy="20" r="8" fill="%COLOR%"/>
  <circle cx="39" cy="33" r="8" fill="%COLOR%"/>
  <circle cx="25" cy="33" r="8" fill="%COLOR%"/>
  <circle cx="21" cy="20" r="8" fill="%COLOR%"/>
  <circle cx="32" cy="12" r="8"/>
  <circle cx="43" cy="20" r="8"/>
  <circle cx="39" cy="33" r="8"/>
  <circle cx="25" cy="33" r="8"/>
  <circle cx="21" cy="20" r="8"/>
  <circle cx="32" cy="24" r="7" fill="${COLORS.yellow}"/>
  <circle cx="32" cy="24" r="7"/>`,

  // ひもつきの風船。結び目まで同じ色で塗る
  balloon: `
  <ellipse cx="32" cy="24" rx="15" ry="18" fill="%COLOR%"/>
  <path d="M28 45 L36 45 L32 40 Z" fill="%COLOR%"/>
  <ellipse cx="32" cy="24" rx="15" ry="18"/>
  <path d="M28 45 L36 45 L32 40 Z"/>
  <ellipse cx="25" cy="16" rx="3" ry="5" fill="${WHITE}"/>
  <path d="M32 45 Q26 51 32 56 Q37 60 32 62"/>`,

  // 開いた傘。傘の布だけを着色し、柄は共通にする
  umbrella: `
  <path d="M6 32 Q8 10 32 10 Q56 10 58 32 Q51 27 45 32 Q38 27 32 32 Q26 27 19 32 Q13 27 6 32 Z" fill="%COLOR%"/>
  <path d="M6 32 Q8 10 32 10 Q56 10 58 32 Q51 27 45 32 Q38 27 32 32 Q26 27 19 32 Q13 27 6 32 Z"/>
  <path d="M32 10 V5"/>
  <path d="M32 32 V51 Q32 57 26 57 Q21 57 21 52"/>`,

  // すべり台を真横から。左にはしご、右へ下る滑走面
  slide: `
  <path d="M10 22 V56"/>
  <path d="M20 22 V56"/>
  <path d="M10 32 H20"/>
  <path d="M10 42 H20"/>
  <rect x="8" y="16" width="16" height="6" rx="2" fill="%COLOR%"/>
  <path d="M22 16 H28 L58 48 V56 H52 L22 24 Z" fill="%COLOR%"/>
  <rect x="8" y="16" width="16" height="6" rx="2"/>
  <path d="M22 16 H28 L58 48 V56 H52 L22 24 Z"/>`,

  // 取っ手つきのバケツ（砂場で使う手おけ）
  bucket: `
  <path d="M18 24 Q32 2 46 24"/>
  <path d="M16 26 H48 L44 54 H20 Z" fill="%COLOR%"/>
  <path d="M16 26 H48 L44 54 H20 Z"/>
  <rect x="13" y="22" width="38" height="7" rx="3" fill="%COLOR%"/>
  <rect x="13" y="22" width="38" height="7" rx="3"/>`,

  // 自転車を真横から。車輪は白、骨組みは暗色の線、サドルとハンドルだけを着色する
  bike: `
  <circle cx="16" cy="42" r="11" fill="${WHITE}"/>
  <circle cx="48" cy="42" r="11" fill="${WHITE}"/>
  <circle cx="16" cy="42" r="11"/>
  <circle cx="48" cy="42" r="11"/>
  <path d="M16 42 L25 26 L33 42 Z"/>
  <path d="M25 26 H43 L33 42"/>
  <path d="M43 26 L48 42"/>
  <path d="M43 26 L41 18"/>
  <rect x="18" y="18" width="14" height="6" rx="3" fill="%COLOR%"/>
  <rect x="18" y="18" width="14" height="6" rx="3"/>
  <rect x="36" y="14" width="12" height="6" rx="3" fill="%COLOR%"/>
  <rect x="36" y="14" width="12" height="6" rx="3"/>`,

  // 以下は「台所」パックの形状

  // ふたつきの両手鍋。本体とふたを着色し、つまみと取っ手は共通にする
  pot: `
  <path d="M14 30 H6"/>
  <path d="M50 30 H58"/>
  <rect x="14" y="26" width="36" height="26" rx="4" fill="%COLOR%"/>
  <rect x="14" y="26" width="36" height="26" rx="4"/>
  <path d="M10 26 Q32 10 54 26 Z" fill="%COLOR%"/>
  <path d="M10 26 Q32 10 54 26 Z"/>
  <circle cx="32" cy="14" r="4" fill="${INK}"/>`,

  // 斜め上から見たフライパン。本体と焼き面を着色し、長い柄は暗色に固定する。
  // 真上から描くと円と柄だけになり、44pxで虫めがねに見えるため、浅い側面を見せる。
  // 側面を深くすると片手鍋に見えるため、高さを口径の3割ほどに抑える
  pan: `
  <rect x="42" y="30" width="19" height="6" rx="3" fill="${INK}"/>
  <path d="M4 31 H44 L41 40 Q40 43 36 43 H12 Q8 43 7 40 Z" fill="%COLOR%"/>
  <path d="M4 31 H44 L41 40 Q40 43 36 43 H12 Q8 43 7 40 Z"/>
  <ellipse cx="24" cy="31" rx="20" ry="5" fill="%COLOR%"/>
  <ellipse cx="24" cy="31" rx="20" ry="5"/>`,

  // 真横から見た深いお椀。台の部分は暗色にする
  bowl: `
  <rect x="23" y="46" width="18" height="7" rx="2" fill="${INK}"/>
  <path d="M7 26 H57 Q56 48 32 48 Q8 48 7 26 Z" fill="%COLOR%"/>
  <path d="M7 26 H57 Q56 48 32 48 Q8 48 7 26 Z"/>`,

  // ラベルつきのびん。本体を着色し、ふたとラベルは共通にする
  bottle: `
  <path d="M26 14 H38 V20 Q46 25 46 33 V54 Q46 58 42 58 H22 Q18 58 18 54 V33 Q18 25 26 20 Z" fill="%COLOR%"/>
  <path d="M26 14 H38 V20 Q46 25 46 33 V54 Q46 58 42 58 H22 Q18 58 18 54 V33 Q18 25 26 20 Z"/>
  <rect x="25" y="6" width="14" height="8" rx="2" fill="${INK}"/>
  <rect x="18" y="36" width="28" height="12" fill="${WHITE}"/>
  <rect x="18" y="36" width="28" height="12"/>`,

  // 注ぎ口と上の取っ手があるやかん
  kettle: `
  <path d="M18 34 Q32 -6 46 34"/>
  <path d="M18 42 L5 28 L9 25 L22 36 Z" fill="%COLOR%"/>
  <path d="M18 42 L5 28 L9 25 L22 36 Z"/>
  <path d="M14 54 Q10 28 32 26 Q54 28 50 54 Z" fill="%COLOR%"/>
  <path d="M14 54 Q10 28 32 26 Q54 28 50 54 Z"/>
  <circle cx="32" cy="24" r="4" fill="${INK}"/>`,

  // スプーン。頭と柄を同じ色で塗る
  spoon: `
  <rect x="28" y="28" width="8" height="30" rx="4" fill="%COLOR%"/>
  <rect x="28" y="28" width="8" height="30" rx="4"/>
  <ellipse cx="32" cy="18" rx="11" ry="13" fill="%COLOR%"/>
  <ellipse cx="32" cy="18" rx="11" ry="13"/>`,

  // フォーク。3本の歯は暗色の線で描き、柄だけを着色する
  fork: `
  <path d="M21 6 V22"/>
  <path d="M32 6 V22"/>
  <path d="M43 6 V22"/>
  <path d="M21 22 Q21 33 32 33 Q43 33 43 22"/>
  <rect x="28" y="31" width="8" height="27" rx="4" fill="%COLOR%"/>
  <rect x="28" y="31" width="8" height="27" rx="4"/>`,

  // へたと葉のあるりんご。葉は暗色にする
  apple: `
  <path d="M32 21 Q44 12 51 24 Q57 40 45 53 Q38 58 32 54 Q26 58 19 53 Q7 40 13 24 Q20 12 32 21 Z" fill="%COLOR%"/>
  <path d="M32 21 Q44 12 51 24 Q57 40 45 53 Q38 58 32 54 Q26 58 19 53 Q7 40 13 24 Q20 12 32 21 Z"/>
  <path d="M32 21 Q31 12 35 7"/>
  <path d="M35 14 Q43 5 49 11 Q42 18 35 14 Z" fill="${INK}"/>`,

  // 目玉焼き。白身は白に固定し、黄身だけを着色する
  egg: `
  <path d="M12 34 Q8 18 24 14 Q34 6 46 14 Q58 20 54 34 Q56 50 40 52 Q28 58 18 50 Q8 44 12 34 Z" fill="${WHITE}"/>
  <path d="M12 34 Q8 18 24 14 Q34 6 46 14 Q58 20 54 34 Q56 50 40 52 Q28 58 18 50 Q8 44 12 34 Z"/>
  <circle cx="33" cy="32" r="10" fill="%COLOR%"/>
  <circle cx="33" cy="32" r="10"/>`,

  // 2ドアの冷蔵庫を正面から
  fridge: `
  <rect x="16" y="5" width="32" height="50" rx="4" fill="%COLOR%"/>
  <rect x="16" y="5" width="32" height="50" rx="4"/>
  <path d="M16 23 H48"/>
  <path d="M41 11 V17"/>
  <path d="M41 29 V39"/>
  <path d="M20 55 V59"/>
  <path d="M44 55 V59"/>`,
};

// アイテムid -> [形状, 色]。standardの色違いは同じ形状から作る
const ITEMS = {
  // easy
  cat: ["cat", "black"],
  dog: ["dog", "yellow"],
  book: ["book", "red"],
  cup: ["cup", "white"],
  key: ["key", "yellow"],
  clock: ["clock", "white"],
  lamp: ["lamp", "yellow"],
  chair: ["chair", "blue"],
  plant: ["plant", "red"],
  ball: ["ball", "blue"],
  // standard（5形状 × red/blue）
  red_book: ["book", "red"],
  blue_book: ["book", "blue"],
  red_cup: ["cup", "red"],
  blue_cup: ["cup", "blue"],
  red_ball: ["ball", "red"],
  blue_ball: ["ball", "blue"],
  red_chair: ["chair", "red"],
  blue_chair: ["chair", "blue"],
  red_lamp: ["lamp", "red"],
  blue_lamp: ["lamp", "blue"],
  // 公園 easy
  tree: ["tree", "yellow"],
  bench: ["bench", "red"],
  bird: ["bird", "blue"],
  kite: ["kite", "yellow"],
  flower: ["flower", "red"],
  balloon: ["balloon", "blue"],
  umbrella: ["umbrella", "black"],
  slide: ["slide", "yellow"],
  bucket: ["bucket", "red"],
  bike: ["bike", "blue"],
  // 公園 standard（5形状 × red/blue）
  red_kite: ["kite", "red"],
  blue_kite: ["kite", "blue"],
  red_balloon: ["balloon", "red"],
  blue_balloon: ["balloon", "blue"],
  red_umbrella: ["umbrella", "red"],
  blue_umbrella: ["umbrella", "blue"],
  red_bucket: ["bucket", "red"],
  blue_bucket: ["bucket", "blue"],
  red_bench: ["bench", "red"],
  blue_bench: ["bench", "blue"],
  // 台所 easy
  pot: ["pot", "red"],
  pan: ["pan", "black"],
  bowl: ["bowl", "white"],
  bottle: ["bottle", "blue"],
  kettle: ["kettle", "yellow"],
  spoon: ["spoon", "blue"],
  fork: ["fork", "yellow"],
  apple: ["apple", "red"],
  egg: ["egg", "yellow"],
  fridge: ["fridge", "white"],
  // 台所 standard（5形状 × red/blue）
  red_pot: ["pot", "red"],
  blue_pot: ["pot", "blue"],
  red_pan: ["pan", "red"],
  blue_pan: ["pan", "blue"],
  red_bowl: ["bowl", "red"],
  blue_bowl: ["bowl", "blue"],
  red_bottle: ["bottle", "red"],
  blue_bottle: ["bottle", "blue"],
  red_kettle: ["kettle", "red"],
  blue_kettle: ["kettle", "blue"],
};

mkdirSync(OUT, { recursive: true });

for (const [id, [shape, color]] of Object.entries(ITEMS)) {
  const body = SHAPES[shape].replaceAll("%COLOR%", COLORS[color]).trimEnd();
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">`,
    `  <g ${G}>${body}`,
    `  </g>`,
    `</svg>`,
    "",
  ].join("\n");
  writeFileSync(path.join(OUT, `${id}.svg`), svg, "utf8");
}

console.log(`generated ${Object.keys(ITEMS).length} icons into ${OUT}`);
