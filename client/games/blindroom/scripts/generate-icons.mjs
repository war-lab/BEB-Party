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
