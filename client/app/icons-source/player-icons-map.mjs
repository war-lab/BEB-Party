// プレイヤーアイコンの絵の正本。16x16のドットマップで持つ。
//
// IDと一覧の正本は shared/core/src/player-icon.ts の PLAYER_ICONS（ADR-0022）。
// ここを直したら `pnpm --filter @beb/client-app run icons:generate` で
// client/public/player-icons/（PNG）と icons-source/svg/（SVG）を作り直す。
//
// 記号は1マス1色。`.` は透明。共通の記号は PALETTE、アイコン固有の記号は各 colors で定義する。
// 全マスに定義が要る（未定義の記号があれば生成が失敗する）。
//
// 40px前後で見分けがつくよう、描き方を揃える。
//   * 目は2x2の塊にする（1マス幅の線は閉じた目に見え、表情の差が出ない）
//   * 口は2マス幅までに留める（4マス幅は全員が大口を開けた顔になる）
//   * 耳・角は塗りつぶす（輪郭だけだと角のように見える）

export const GRID = 16;

export const PALETTE = {
  "#": "#1b1b2e", // 輪郭と目
  S: "#f7c9a2", // 肌
  s: "#e0a179", // 肌の影
  b: "#ef8b8b", // ほお
  W: "#ffffff", // 白
  w: "#c9ccdd", // 白の影
};

export const ICONS = [
  {
    id: "dark-hair",
    labelJa: "くろかみ",
    colors: { H: "#31314a" },
    map: `
................
................
....########....
...#HHHHHHHH#...
..#HHHHHHHHHH#..
..#HHHHHHHHHH#..
..#HSSSSSSSSH#..
..#S##SSSS##S#..
..#S##SSSS##S#..
..#SSSSSSSSSS#..
..#SbSS##SSbS#..
..#SSSSSSSSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "smile",
    labelJa: "えがお",
    colors: { H: "#8a5a30" },
    // 目を閉じた線にし、口を開けて笑わせる（下地との違いは目と口だけ）
    map: `
................
................
....########....
...#HHHHHHHH#...
..#HHHHHHHHHH#..
..#HHHHHHHHHH#..
..#HSSSSSSSSH#..
..#SSSSSSSSSS#..
..#S##SSSS##S#..
..#SSSSSSSSSS#..
..#SbS####SbS#..
..#SSS####SSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "glasses",
    labelJa: "めがね",
    colors: { H: "#8a5a30" },
    map: `
................
................
....########....
...#HHHHHHHH#...
..#HHHHHHHHHH#..
..#HHHHHHHHHH#..
..#HSSSSSSSSH#..
..#WWW#SS#WWW#..
..#W#W#SS#W#W#..
..#WWW#SS#WWW#..
..#SbSS##SSbS#..
..#SSSSSSSSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "sunglasses",
    labelJa: "サングラス",
    colors: { H: "#e8c86a" },
    map: `
................
................
....########....
...#HHHHHHHH#...
..#HHHHHHHHHH#..
..#HHHHHHHHHH#..
..#HSSSSSSSSH#..
..############..
..###WW##WW###..
..############..
..#SbSS##SSbS#..
..#SSSSSSSSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "red-cap",
    labelJa: "あかいキャップ",
    colors: { R: "#e2453c" },
    map: `
................
................
....########....
...#RRRRRRRR#...
..#RRRRRRRRRR#..
..#RRWWWWWWRR#..
.##############.
..#SSSSSSSSSS#..
..#S##SSSS##S#..
..#S##SSSS##S#..
..#SbSS##SSbS#..
..#SSSSSSSSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "beanie",
    labelJa: "ニットぼう",
    colors: { B: "#3f8fd8", C: "#2b6ca8", P: "#f2d05a" },
    map: `
................
.....##PP##.....
....########....
...#BCBBBBCB#...
..#BBCBBBBCBB#..
..#BBCBBBBCBB#..
.##############.
..#SSSSSSSSSS#..
..#S##SSSS##S#..
..#S##SSSS##S#..
..#SbSS##SSbS#..
..#SSSSSSSSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "headphones",
    labelJa: "ヘッドホン",
    colors: { H: "#8a5a30", P: "#b06ad8", p: "#8a49b0" },
    map: `
................
...PPPPPPPPPP...
.P.##########.P.
.P.#HHHHHHHH#.P.
.P#HHHHHHHHHH#P.
PP#HHHHHHHHHH#PP
PP#HSSSSSSSSH#PP
PP#S##SSSS##S#PP
PP#S##SSSS##S#PP
PP#SSSSSSSSSS#PP
.P#SbSS##SSbS#P.
..#SSSSSSSSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "mustache",
    labelJa: "ひげ",
    colors: { H: "#31314a" },
    map: `
................
................
....########....
...#HHHHHHHH#...
..#HHHHHHHHHH#..
..#HHHHHHHHHH#..
..#HSSSSSSSSH#..
..#S##SSSS##S#..
..#S##SSSS##S#..
..#SSSSSSSSSS#..
..#SS######SS#..
..#SSSS##SSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "spiky",
    labelJa: "ツンツンあたま",
    colors: { H: "#ef7a2a" },
    map: `
................
...#..##..#.....
..#H#HHHH#H#....
..#HHHHHHHHH#...
..#HHHHHHHHHH#..
..#HHHHHHHHHH#..
..#HSSSSSSSSH#..
..#S##SSSS##S#..
..#S##SSSS##S#..
..#SSSSSSSSSS#..
..#SbSS##SSbS#..
..#SSSSSSSSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "bob",
    labelJa: "ボブ",
    colors: { H: "#2b3a5c" },
    map: `
................
................
....########....
...#HHHHHHHH#...
..#HHHHHHHHHH#..
..#HHHHHHHHHH#..
..#HHHHHHHHHH#..
..#HS##SS##SH#..
..#HS##SS##SH#..
..#HSSSSSSSSH#..
..#HSbS##SbSH#..
..#HSSSSSSSSH#..
...#HSSSSSSH#...
....########....
................
................
`,
  },
  {
    id: "purple-cap",
    labelJa: "むらさきキャップ",
    colors: { R: "#8a5ad8", Y: "#f2d05a" },
    map: `
................
................
....########....
...#RRRRRRRR#...
..#RRRRRRRRRR#..
..#RRYYYYYYRR#..
.##############.
..#SSSSSSSSSS#..
..#S##SSSS##S#..
..#S##SSSS##S#..
..#SbSS##SSbS#..
..#SSSSSSSSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "short-hair",
    labelJa: "ショートヘア",
    colors: { H: "#a06a3a" },
    map: `
................
................
....########....
...#HHHHHHHH#...
..#HHHHHHHHHH#..
..#HHHHSSSSSH#..
..#HSSSSSSSSH#..
..#S##SSSS##S#..
..#S##SSSS##S#..
..#SSSSSSSSSS#..
..#SbSS##SSbS#..
..#SSSSSSSSSS#..
...#SSSSSSSS#...
....########....
................
................
`,
  },
  {
    id: "cat",
    labelJa: "ねこ",
    colors: { O: "#e8952e", o: "#c8761c", P: "#f4a7bd" },
    map: `
................
..##........##..
..#OO#....#OO#..
..#OOO####OOO#..
.#OOoOOOOOOoOO#.
.#OOOOOOOOOOOO#.
.#O##OOOOOO##O#.
.#O##OOOOOO##O#.
.#OOOOOWWOOOOO#.
.#OOOWWPPWWOOO#.
.#OOWWW##WWWOO#.
..#OOWWWWWWOO#..
..#OOOOOOOOOO#..
...##########...
................
................
`,
  },
  {
    id: "dog",
    labelJa: "いぬ",
    colors: { D: "#f0e2cc", E: "#9a6234", P: "#e08a9a" },
    map: `
................
................
..####....####..
..#EEE####EEE#..
.#EEEDDDDDDEEE#.
.#EEDDDDDDDDEE#.
.#EE##DDDD##EE#.
.#EE##DDDD##EE#.
.#EEDDDWWDDDEE#.
..#DDDWWWWDDD#..
..#DDDW##WDDD#..
..#DDDDPPDDDD#..
..#DDDDDDDDDD#..
...##########...
................
................
`,
  },
  {
    id: "rabbit",
    labelJa: "うさぎ",
    colors: { P: "#f4a7bd" },
    map: `
................
................
....##....##....
...#PP#..#PP#...
..#WPP####PPW#..
.#WWWWWWWWWWWW#.
.#W##WWWWWW##W#.
.#W##WWWWWW##W#.
.#WWWWWWWWWWWW#.
.#WWWbWPPWbWWW#.
.#WWWWWW##WWWW#.
.#WWWWWWWWWWWW#.
..#WWWWWWWWWW#..
...##########...
................
................
`,
  },
  {
    id: "bear",
    labelJa: "くま",
    colors: { N: "#a5713f", n: "#e0c39a" },
    map: `
................
................
..####....####..
..#NNN####NNN#..
.#NNNNNNNNNNNN#.
.#NNNNNNNNNNNN#.
.#N##NNNNNN##N#.
.#N##NNNNNN##N#.
.#NNNNnnnnNNNN#.
.#NNNnnnnnnNNN#.
.#NNNnn##nnNNN#.
..#NNnnnnnnNN#..
..#NNNNNNNNNN#..
...##########...
................
................
`,
  },
  {
    id: "frog",
    labelJa: "かえる",
    colors: { G: "#6fb83c", g: "#4d8f28" },
    map: `
................
..####....####..
.##WW##..##WW##.
.#W##WW..WW##W#.
.#W##WWWWWW##W#.
.#WWWWGGGGWWWW#.
.#GGGGGGGGGGGG#.
.#GGGGGGGGGGGG#.
.#GgGGGGGGGGgG#.
.#GG#GGGGGG#GG#.
.#GGG######GGG#.
..#GGGGGGGGGG#..
..#GGGGGGGGGG#..
...##########...
................
................
`,
  },
  {
    id: "penguin",
    labelJa: "ペンギン",
    colors: { K: "#2b3049", Y: "#f2b134" },
    map: `
................
................
....########....
...#KKKKKKKK#...
..#KKKKKKKKKK#..
.#KKKKKKKKKKKK#.
.#KKWWWWWWWWKK#.
.#KW##WWWW##WK#.
.#KW##WWWW##WK#.
.#KWWWWYYWWWWK#.
.#KWWWWYYWWWWK#.
..#KWWWWWWWWK#..
..#KKWWWWWWKK#..
...##########...
................
................
`,
  },
  {
    id: "owl",
    labelJa: "ふくろう",
    colors: { N: "#9a6a3c", n: "#c9a06a", Y: "#f2b134" },
    map: `
................
................
...##########...
..#NNNNNNNNNN#..
.#NNNNNNNNNNNN#.
.#NWWWWNNWWWWN#.
.#NW##WNNW##WN#.
.#NW##WNNW##WN#.
.#NWWWWNNWWWWN#.
.#NNNNNYYNNNNN#.
.#NnNNNYYNNNnN#.
..#NnnNNNNnnN#..
..#NNnnnnnnNN#..
...##########...
................
................
`,
  },
  {
    id: "fox",
    labelJa: "きつね",
    colors: { O: "#e8762e", o: "#c05a1a" },
    map: `
................
..##........##..
..#OO#....#OO#..
..#OOO####OOO#..
.#OOOOOOOOOOOO#.
.#OOOOOOOOOOOO#.
.#O##OOOOOO##O#.
.#O##OOOOOO##O#.
.#OOOOOOOOOOOO#.
.#OOWWWWWWWWOO#.
.#OWWWW##WWWWO#.
..#WWWWWWWWWW#..
...#WWWWWWWW#...
....########....
................
................
`,
  },
  {
    id: "pig",
    labelJa: "ぶた",
    colors: { P: "#f0a0b8", p: "#d97e98" },
    map: `
................
................
..####....####..
..#PPP####PPP#..
.#PPPPPPPPPPPP#.
.#PPPPPPPPPPPP#.
.#P##PPPPPP##P#.
.#P##PPPPPP##P#.
.#PPPPPPPPPPPP#.
.#PPPppppppPPP#.
.#PPPpp##ppPPP#.
.#PPPppppppPPP#.
..#PPPPPPPPPP#..
...##########...
................
................
`,
  },
  {
    id: "hamster",
    labelJa: "ハムスター",
    colors: { N: "#d8a25e", n: "#f0d8b0" },
    map: `
................
................
..####....####..
..#NNN####NNN#..
.#NNNNNNNNNNNN#.
.#NNNNNNNNNNNN#.
.#N##NNNNNN##N#.
.#N##NNNNNN##N#.
#nnNNNNNNNNNNnn#
#nnnNNNnnNNNnnn#
#nnnNNn##nNNnnn#
.#nnNNnnnnNNnn#.
..#NNNNNNNNNN#..
...##########...
................
................
`,
  },
  {
    id: "blob",
    labelJa: "ぷにぷに",
    colors: { U: "#7b5cd6", u: "#b39df0" },
    map: `
................
................
.....######.....
....##UUUU##....
...##UUUUUU##...
..##uUUUUUUU##..
..#uUUUUUUUUU#..
.##UU##UU##UU##.
.#UUU##UU##UUU#.
.#UUUUUUUUUUUU#.
.#UUUUU##UUUUU#.
.#UUUUUUUUUUUU#.
.##UUUUUUUUUU##.
..#UUUUUUUUUU#..
..############..
................
`,
  },
  {
    id: "ghost",
    labelJa: "おばけ",
    colors: { g: "#c9ccdd" },
    map: `
................
................
.....######.....
....##WWWW##....
...#WWWWWWWW#...
..#WWWWWWWWWW#..
..#W##WWWW##W#..
..#W##WWWW##W#..
..#WWWWWWWWWW#..
..#WWWW##WWWW#..
..#WWWWWWWWWW#..
..#WgWWWWWWgW#..
..#WWWWWWWWWW#..
..#W##WW##WW#...
...##.####.##...
................
`,
  },
  {
    id: "robot",
    labelJa: "ロボット",
    colors: { M: "#b9bfd0", m: "#8a90a3", R: "#e2453c", C: "#4fc3e8" },
    map: `
................
.......##.......
......#RR#......
......#mm#......
...##########...
..#MMMMMMMMMM#..
.##MMMMMMMMMM##.
.#C#MCCMMCCM#C#.
.#C#MCCMMCCM#C#.
.#C#MMMMMMMM#C#.
.##M#m#m#m#M##..
..#MM#m#m#MM#...
..#MMMMMMMMMM#..
...##########...
................
................
`,
  },
  {
    id: "alien",
    labelJa: "うちゅうじん",
    colors: { G: "#8fce5a", g: "#6ba83c" },
    map: `
................
................
....########....
...#GGGGGGGG#...
..#GGGGGGGGGG#..
.#GGGGGGGGGGGG#.
.#GGGGGGGGGGGG#.
.#G##GGGGGG##G#.
.#####GGGG#####.
.#G##GGGGGG##G#.
.#GGGGGGGGGGGG#.
..#GGGG##GGGG#..
..#GgGGGGGGgG#..
...##########...
................
................
`,
  },
  {
    id: "dragon",
    labelJa: "ドラゴン",
    colors: { R: "#e04a2a", r: "#b02f18", Y: "#f2c14e" },
    map: `
................
..##........##..
..#YY#....#YY#..
..#YYY####YYY#..
.#RRRRRRRRRRRR#.
.#RRRRRRRRRRRR#.
.#RY##RRRR##YR#.
.#RY##RRRR##YR#.
.#RRRRRRRRRRRR#.
.#RRrrrrrrrrRR#.
.#RrrWW##WWrrR#.
..#rrrrrrrrrr#..
..#RRRRRRRRRR#..
...##########...
................
................
`,
  },
  {
    id: "crown",
    labelJa: "おうかん",
    colors: { Y: "#f2c14e", y: "#c9971e", R: "#e2453c", B: "#3f8fd8" },
    map: `
................
................
..#........#....
..#R#..#B#.#R#..
..#YY#.#Y#.#YY#.
..#YYY#YYY#YYY#.
..#YYYYYYYYYYY#.
..#YYYYYYYYYYY#.
..#YyYYYYYYYyY#.
..#YYYRYYYBYYY#.
..#YyYYYYYYYyY#.
..#############.
..#############.
................
................
................
`,
  },
  {
    id: "book",
    labelJa: "ほん",
    colors: { B: "#3f6fd8", W2: "#f6f2e2", L: "#b9b3a0" },
    map: `
................
................
..############..
.#BB########BB#.
.#BWWWW##WWWWB#.
.#BWLLW##WLLWB#.
.#BWWWW##WWWWB#.
.#BWLLW##WLLWB#.
.#BWWWW##WWWWB#.
.#BWLLW##WLLWB#.
.#BWWWW##WWWWB#.
.#BWLLW##WLLWB#.
.#BB########BB#.
..############..
................
................
`,
  },
  {
    id: "dice",
    labelJa: "サイコロ",
    colors: { R: "#e2453c", w: "#d8dae8" },
    map: `
................
................
..############..
..#WWWWWWWWWW#..
..#WRRWWWWRRW#..
..#WRRWWWWRRW#..
..#WWWWWWWWWW#..
..#WWWW##WWWW#..
..#WWWW##WWWW#..
..#WWWWWWWWWW#..
..#WRRWWWWRRW#..
..#WRRWWWWRRW#..
..#wwwwwwwwww#..
..############..
................
................
`,
  },
];
