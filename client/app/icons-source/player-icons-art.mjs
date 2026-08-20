// プレイヤーアイコンの絵の正本。128x128の格子へ図形を重ねて描く。
//
// IDと一覧の正本は shared/core/src/player-icon.ts の PLAYER_ICONS（ADR-0022）。
// ここを直したら `pnpm --filter @beb/client-app run icons:generate` で
// client/public/player-icons/（PNG）と icons-source/svg/（SVG）を作り直す。
//
// 画風の決まり
//   * 輪郭は最後に outline() で一括して付ける（幅4）。輪郭線は自分で描かない
//   * 面は単色。陰影は下端の1段（shadeBottom）と、必要なら明るい面を1つだけにする
//   * 目は塊で描き、白いハイライトを左上に1つ置く
//   * 人物12件は同じ頭の下地を共有し、髪型と小物だけを変える（並べたときに背の高さが揃う）
//   * 目の中心はy=76、口はy=96前後に置く。髪の裾はy=58までとし、目に被せない

export const GRID = 128;
export const OUTLINE = "#1b1b2e";
export const OUTLINE_WIDTH = 4;

const SKIN = "#f7c9a2";
const SKIN_SHADE = "#e0a179";
const BLUSH = "#f0918f";
const WHITE = "#ffffff";
const PINK = "#f4a7bd";

/** 目。白いハイライト付きの塊 */
function eye(c, cx, cy, r) {
  c.circle(cx, cy, r, OUTLINE);
  c.circle(cx - r * 0.32, cy - r * 0.34, r * 0.3, WHITE);
}

/** 笑って閉じた目。への字に折った線 */
function closedEye(c, cx, cy) {
  c.line(cx - 9, cy + 5, cx, cy - 3, 6, OUTLINE);
  c.line(cx, cy - 3, cx + 9, cy + 5, 6, OUTLINE);
}

/** 口。人物で共通に使う */
function mouthShape(c, kind) {
  if (kind === "small") {
    c.roundRect(54, 96, 20, 7, 3, OUTLINE);
  } else if (kind === "open") {
    c.roundRect(50, 90, 28, 18, 9, OUTLINE);
    c.roundRect(56, 101, 16, 7, 3, "#ef8b8b");
  }
}

/** 動物の口元。三角の鼻とへの字の口 */
function snoutMouth(c, cx, cy, noseColor) {
  c.polygon(
    [
      [cx - 7, cy - 6],
      [cx + 7, cy - 6],
      [cx, cy + 2],
    ],
    noseColor,
  );
  c.line(cx, cy + 1, cx, cy + 6, 4, OUTLINE);
  c.line(cx, cy + 6, cx - 9, cy + 3, 4, OUTLINE);
  c.line(cx, cy + 6, cx + 9, cy + 3, 4, OUTLINE);
}

/** 人物の頭 */
function head(c, { hair, hairShape, front, back, mouth = "small", eyes = "open" }) {
  back?.(c);
  c.roundRect(24, 24, 80, 86, 26, SKIN);
  const headMask = c.mask();

  c.clip(headMask, () => hairShape?.(c, hair));

  if (eyes === "open") {
    eye(c, 47, 76, 10);
    eye(c, 81, 76, 10);
  } else {
    closedEye(c, 47, 76);
    closedEye(c, 81, 76);
  }
  c.clip(headMask, () => {
    c.ellipse(34, 90, 8, 5, BLUSH);
    c.ellipse(94, 90, 8, 5, BLUSH);
  });
  mouthShape(c, mouth);

  front?.(c, headMask);
  c.clip(headMask, () => c.shadeBottom(SKIN_SHADE, 3, headMask));
}

/** 前髪をそろえた髪 */
function bangs(c, color) {
  c.roundRect(24, 24, 80, 30, 20, color);
  c.rect(24, 24, 10, 44, color);
  c.rect(94, 24, 10, 44, color);
}

/** つばのある帽子。顔は下地より下に置く */
function capFace(c, { crown, panel, brim }) {
  c.roundRect(24, 30, 80, 80, 26, SKIN);
  const face = c.mask();
  eye(c, 47, 78, 10);
  eye(c, 81, 78, 10);
  c.clip(face, () => {
    c.ellipse(34, 92, 8, 5, BLUSH);
    c.ellipse(94, 92, 8, 5, BLUSH);
  });
  c.roundRect(54, 98, 20, 7, 3, OUTLINE);
  c.clip(face, () => c.shadeBottom(SKIN_SHADE, 3, face));
  c.roundRect(22, 16, 84, 34, 17, crown);
  c.ellipse(64, 42, 22, 11, panel);
  c.roundRect(12, 44, 104, 12, 6, brim);
}

/** 丸い獣の頭。耳を描いたあとに呼び、頭のマスクを返す */
function beastHead(c, { body, eyeR = 11, eyeY = 68 }) {
  c.roundRect(20, 32, 88, 78, 30, body);
  const mask = c.mask();
  eye(c, 46, eyeY, eyeR);
  eye(c, 82, eyeY, eyeR);
  return mask;
}

export const ICONS = [
  {
    id: "dark-hair",
    labelJa: "くろかみ",
    draw: (c) => head(c, { hair: "#31314a", hairShape: bangs }),
  },
  {
    id: "smile",
    labelJa: "えがお",
    draw: (c) => head(c, { hair: "#8a5a30", hairShape: bangs, eyes: "closed", mouth: "open" }),
  },
  {
    id: "glasses",
    labelJa: "めがね",
    draw: (c) =>
      head(c, {
        hair: "#8a5a30",
        hairShape: bangs,
        front: (c2) => {
          c2.circle(47, 76, 18, OUTLINE);
          c2.circle(81, 76, 18, OUTLINE);
          c2.circle(47, 76, 14, "#eaf1ff");
          c2.circle(81, 76, 14, "#eaf1ff");
          c2.rect(61, 74, 6, 5, OUTLINE);
          eye(c2, 47, 76, 8);
          eye(c2, 81, 76, 8);
        },
      }),
  },
  {
    id: "sunglasses",
    labelJa: "サングラス",
    draw: (c) =>
      head(c, {
        hair: "#e8c86a",
        hairShape: bangs,
        front: (c2) => {
          c2.roundRect(28, 64, 34, 24, 10, OUTLINE);
          c2.roundRect(66, 64, 34, 24, 10, OUTLINE);
          c2.rect(60, 70, 8, 6, OUTLINE);
          c2.polygon(
            [
              [32, 82],
              [44, 68],
              [50, 68],
              [38, 82],
            ],
            "#5b6382",
          );
          c2.polygon(
            [
              [70, 82],
              [82, 68],
              [88, 68],
              [76, 82],
            ],
            "#5b6382",
          );
        },
      }),
  },
  {
    id: "red-cap",
    labelJa: "あかいキャップ",
    draw: (c) => capFace(c, { crown: "#e2453c", panel: WHITE, brim: "#c9382f" }),
  },
  {
    id: "beanie",
    labelJa: "ニットぼう",
    draw: (c) => {
      capFace(c, { crown: "#3f8fd8", panel: "#3f8fd8", brim: "#2b6ca8" });
      for (const x of [34, 50, 66, 82, 98]) {
        c.rect(x, 20, 4, 26, "#2b6ca8");
      }
      c.circle(64, 12, 10, "#f2d05a");
    },
  },
  {
    id: "headphones",
    labelJa: "ヘッドホン",
    draw: (c) =>
      head(c, {
        hair: "#8a5a30",
        hairShape: bangs,
        front: (c2) => {
          // バンドとイヤーカップ
          c2.roundRect(20, 12, 88, 14, 7, "#b06ad8");
          c2.roundRect(14, 18, 14, 44, 7, "#b06ad8");
          c2.roundRect(100, 18, 14, 44, 7, "#b06ad8");
          c2.roundRect(6, 56, 26, 38, 12, "#b06ad8");
          c2.roundRect(96, 56, 26, 38, 12, "#b06ad8");
          c2.roundRect(12, 64, 14, 22, 7, "#8a49b0");
          c2.roundRect(102, 64, 14, 22, 7, "#8a49b0");
        },
      }),
  },
  {
    id: "mustache",
    labelJa: "ひげ",
    draw: (c) =>
      head(c, {
        hair: "#31314a",
        hairShape: bangs,
        mouth: null,
        front: (c2) => {
          c2.ellipse(52, 92, 14, 7, OUTLINE);
          c2.ellipse(76, 92, 14, 7, OUTLINE);
          c2.roundRect(56, 102, 16, 6, 3, OUTLINE);
        },
      }),
  },
  {
    id: "spiky",
    labelJa: "ツンツンあたま",
    draw: (c) =>
      head(c, {
        hair: "#ef7a2a",
        back: (c2) => {
          // 隣とつながるよう底辺を重ねる
          const spikes = [
            [20, 52, 30, 6, 50, 44],
            [34, 46, 48, 2, 64, 42],
            [60, 42, 72, 2, 88, 46],
            [80, 44, 96, 6, 108, 52],
          ];
          for (const [x1, y1, x2, y2, x3, y3] of spikes) {
            c2.polygon(
              [
                [x1, y1],
                [x2, y2],
                [x3, y3],
              ],
              "#ef7a2a",
            );
          }
        },
        hairShape: (c2, color) => {
          c2.roundRect(24, 24, 80, 32, 18, color);
          c2.rect(24, 24, 10, 42, color);
          c2.rect(94, 24, 10, 42, color);
        },
      }),
  },
  {
    id: "bob",
    labelJa: "ボブ",
    draw: (c) =>
      head(c, {
        hair: "#2b3a5c",
        hairShape: (c2, color) => {
          c2.roundRect(24, 24, 80, 32, 20, color);
          c2.rect(24, 24, 11, 86, color);
          c2.rect(93, 24, 11, 86, color);
        },
      }),
  },
  {
    id: "purple-cap",
    labelJa: "むらさきキャップ",
    draw: (c) => capFace(c, { crown: "#8a5ad8", panel: "#f2d05a", brim: "#6b3fb0" }),
  },
  {
    id: "short-hair",
    labelJa: "ショートヘア",
    draw: (c) =>
      head(c, {
        hair: "#a06a3a",
        hairShape: (c2, color) => {
          c2.roundRect(24, 24, 80, 30, 20, color);
          c2.rect(24, 24, 10, 44, color);
          c2.rect(94, 24, 10, 40, color);
          // 分け目
          c2.polygon(
            [
              [34, 54],
              [72, 54],
              [34, 70],
            ],
            color,
          );
        },
      }),
  },
  {
    id: "cat",
    labelJa: "ねこ",
    draw: (c) => {
      const body = "#e8952e";
      c.polygon(
        [
          [24, 54],
          [28, 10],
          [58, 34],
        ],
        body,
      );
      c.polygon(
        [
          [104, 54],
          [100, 10],
          [70, 34],
        ],
        body,
      );
      c.polygon(
        [
          [33, 46],
          [35, 21],
          [51, 34],
        ],
        PINK,
      );
      c.polygon(
        [
          [95, 46],
          [93, 21],
          [77, 34],
        ],
        PINK,
      );
      const mask = beastHead(c, { body });
      c.clip(mask, () => {
        c.ellipse(64, 92, 25, 16, "#fdf3e6");
        snoutMouth(c, 64, 88, PINK);
        c.shadeBottom("#c8761c", 3, mask);
      });
    },
  },
  {
    id: "dog",
    labelJa: "いぬ",
    draw: (c) => {
      const body = "#f0e2cc";
      const ear = "#9a6234";
      c.roundRect(8, 34, 26, 58, 13, ear);
      c.roundRect(94, 34, 26, 58, 13, ear);
      const mask = beastHead(c, { body });
      c.clip(mask, () => {
        c.ellipse(64, 92, 26, 17, WHITE);
        snoutMouth(c, 64, 88, OUTLINE);
        c.shadeBottom("#d8c7ab", 3, mask);
      });
    },
  },
  {
    id: "rabbit",
    labelJa: "うさぎ",
    draw: (c) => {
      // 耳は短くして正方形に収める
      c.roundRect(34, 8, 20, 34, 10, WHITE);
      c.roundRect(74, 8, 20, 34, 10, WHITE);
      c.roundRect(39, 14, 10, 24, 5, PINK);
      c.roundRect(79, 14, 10, 24, 5, PINK);
      const mask = beastHead(c, { body: WHITE });
      c.clip(mask, () => {
        c.ellipse(34, 88, 8, 6, PINK);
        c.ellipse(94, 88, 8, 6, PINK);
        snoutMouth(c, 64, 88, PINK);
        c.shadeBottom("#dfe2f0", 3, mask);
      });
    },
  },
  {
    id: "bear",
    labelJa: "くま",
    draw: (c) => {
      const body = "#a5713f";
      c.circle(30, 32, 18, body);
      c.circle(98, 32, 18, body);
      c.circle(30, 32, 9, "#c99a6a");
      c.circle(98, 32, 9, "#c99a6a");
      const mask = beastHead(c, { body });
      c.clip(mask, () => {
        c.ellipse(64, 92, 26, 17, "#e0c39a");
        snoutMouth(c, 64, 88, OUTLINE);
        c.shadeBottom("#8a5c30", 3, mask);
      });
    },
  },
  {
    id: "frog",
    labelJa: "かえる",
    draw: (c) => {
      const body = "#6fb83c";
      c.circle(36, 34, 20, body);
      c.circle(92, 34, 20, body);
      c.roundRect(18, 44, 92, 66, 30, body);
      const mask = c.mask();
      c.circle(36, 34, 13, WHITE);
      c.circle(92, 34, 13, WHITE);
      c.circle(38, 36, 7, OUTLINE);
      c.circle(90, 36, 7, OUTLINE);
      c.clip(mask, () => {
        c.roundRect(34, 78, 60, 14, 7, OUTLINE);
        c.shadeBottom("#4d8f28", 3, mask);
      });
    },
  },
  {
    id: "penguin",
    labelJa: "ペンギン",
    draw: (c) => {
      const body = "#2b3049";
      c.roundRect(20, 26, 88, 84, 32, body);
      const mask = c.mask();
      c.clip(mask, () => c.ellipse(64, 76, 38, 36, WHITE));
      eye(c, 48, 66, 10);
      eye(c, 80, 66, 10);
      c.polygon(
        [
          [56, 82],
          [72, 82],
          [64, 96],
        ],
        "#f2b134",
      );
      c.clip(mask, () => c.shadeBottom("#1f2438", 3, mask));
    },
  },
  {
    id: "owl",
    labelJa: "ふくろう",
    draw: (c) => {
      const body = "#9a6a3c";
      c.polygon(
        [
          [24, 40],
          [34, 14],
          [50, 32],
        ],
        body,
      );
      c.polygon(
        [
          [104, 40],
          [94, 14],
          [78, 32],
        ],
        body,
      );
      c.roundRect(18, 28, 92, 82, 34, body);
      const mask = c.mask();
      c.circle(46, 62, 21, "#f0e2cc");
      c.circle(82, 62, 21, "#f0e2cc");
      eye(c, 46, 62, 13);
      eye(c, 82, 62, 13);
      c.polygon(
        [
          [56, 76],
          [72, 76],
          [64, 92],
        ],
        "#f2b134",
      );
      c.clip(mask, () => {
        c.ellipse(64, 106, 30, 10, "#c9a06a");
        c.shadeBottom("#7d5530", 3, mask);
      });
    },
  },
  {
    id: "fox",
    labelJa: "きつね",
    draw: (c) => {
      const body = "#e8762e";
      c.polygon(
        [
          [22, 52],
          [26, 8],
          [56, 34],
        ],
        body,
      );
      c.polygon(
        [
          [106, 52],
          [102, 8],
          [72, 34],
        ],
        body,
      );
      c.polygon(
        [
          [31, 44],
          [33, 19],
          [49, 34],
        ],
        OUTLINE,
      );
      c.polygon(
        [
          [97, 44],
          [95, 19],
          [79, 34],
        ],
        OUTLINE,
      );
      const mask = beastHead(c, { body });
      c.clip(mask, () => {
        c.polygon(
          [
            [40, 84],
            [88, 84],
            [64, 112],
          ],
          WHITE,
        );
        c.ellipse(64, 88, 26, 10, WHITE);
        snoutMouth(c, 64, 92, OUTLINE);
        c.shadeBottom("#c05a1a", 3, mask);
      });
    },
  },
  {
    id: "pig",
    labelJa: "ぶた",
    draw: (c) => {
      const body = "#f0a0b8";
      c.polygon(
        [
          [20, 52],
          [28, 8],
          [58, 38],
        ],
        body,
      );
      c.polygon(
        [
          [108, 52],
          [100, 8],
          [70, 38],
        ],
        body,
      );
      const mask = beastHead(c, { body });
      c.clip(mask, () => {
        c.ellipse(64, 92, 22, 15, "#d97e98");
        c.ellipse(56, 92, 4, 6, OUTLINE);
        c.ellipse(72, 92, 4, 6, OUTLINE);
        c.shadeBottom("#d97e98", 3, mask);
      });
    },
  },
  {
    id: "hamster",
    labelJa: "ハムスター",
    draw: (c) => {
      const body = "#d8a25e";
      c.circle(34, 34, 15, body);
      c.circle(94, 34, 15, body);
      c.circle(34, 34, 7, PINK);
      c.circle(94, 34, 7, PINK);
      // ほおぶくろ
      c.ellipse(24, 88, 20, 18, "#f0d8b0");
      c.ellipse(104, 88, 20, 18, "#f0d8b0");
      const mask = beastHead(c, { body });
      c.clip(mask, () => {
        c.ellipse(64, 92, 24, 15, "#f0d8b0");
        snoutMouth(c, 64, 88, OUTLINE);
        c.shadeBottom("#b8823e", 3, mask);
      });
    },
  },
  {
    id: "blob",
    labelJa: "ぷにぷに",
    draw: (c) => {
      const body = "#7b5cd6";
      c.ellipse(64, 74, 46, 40, body);
      c.rect(18, 74, 92, 32, body);
      c.roundRect(18, 94, 92, 14, 7, body);
      const mask = c.mask();
      eye(c, 48, 66, 11);
      eye(c, 80, 66, 11);
      c.roundRect(54, 88, 20, 8, 4, OUTLINE);
      c.clip(mask, () => {
        c.ellipse(40, 48, 10, 6, "#b39df0");
        c.shadeBottom("#5f42ab", 3, mask);
      });
    },
  },
  {
    id: "ghost",
    labelJa: "おばけ",
    draw: (c) => {
      c.ellipse(64, 62, 42, 38, WHITE);
      c.rect(22, 62, 84, 38, WHITE);
      // 裾の波
      c.circle(34, 98, 12, WHITE);
      c.circle(64, 98, 12, WHITE);
      c.circle(94, 98, 12, WHITE);
      const mask = c.mask();
      eye(c, 48, 58, 11);
      eye(c, 80, 58, 11);
      c.ellipse(64, 80, 10, 8, OUTLINE);
      c.clip(mask, () => {
        c.ellipse(40, 94, 8, 6, "#dfe2f0");
        c.ellipse(88, 94, 8, 6, "#dfe2f0");
      });
    },
  },
  {
    id: "robot",
    labelJa: "ロボット",
    draw: (c) => {
      const body = "#b9bfd0";
      c.rect(62, 8, 4, 16, "#8a90a3");
      c.circle(64, 10, 8, "#e2453c");
      c.roundRect(22, 28, 84, 76, 14, body);
      c.roundRect(6, 52, 16, 26, 6, "#8a90a3");
      c.roundRect(106, 52, 16, 26, 6, "#8a90a3");
      const mask = c.mask();
      c.roundRect(34, 46, 24, 20, 6, "#4fc3e8");
      c.roundRect(70, 46, 24, 20, 6, "#4fc3e8");
      c.rect(38, 50, 6, 6, WHITE);
      c.rect(74, 50, 6, 6, WHITE);
      // 口のスリット
      c.roundRect(42, 80, 44, 12, 4, "#5b6382");
      for (const x of [50, 58, 66, 74]) {
        c.rect(x, 80, 4, 12, body);
      }
      c.clip(mask, () => c.shadeBottom("#9299ab", 3, mask));
    },
  },
  {
    id: "alien",
    labelJa: "うちゅうじん",
    draw: (c) => {
      const body = "#8fce5a";
      c.ellipse(64, 54, 46, 34, body);
      c.polygon(
        [
          [22, 58],
          [106, 58],
          [80, 106],
          [48, 106],
        ],
        body,
      );
      const mask = c.mask();
      c.ellipse(44, 62, 15, 20, OUTLINE);
      c.ellipse(84, 62, 15, 20, OUTLINE);
      c.ellipse(40, 56, 5, 7, WHITE);
      c.ellipse(80, 56, 5, 7, WHITE);
      c.roundRect(56, 92, 16, 6, 3, OUTLINE);
      c.clip(mask, () => c.shadeBottom("#6ba83c", 3, mask));
    },
  },
  {
    id: "dragon",
    labelJa: "ドラゴン",
    draw: (c) => {
      const body = "#e04a2a";
      c.polygon(
        [
          [30, 34],
          [22, 6],
          [50, 26],
        ],
        "#f2c14e",
      );
      c.polygon(
        [
          [98, 34],
          [106, 6],
          [78, 26],
        ],
        "#f2c14e",
      );
      c.roundRect(20, 30, 88, 60, 26, body);
      // 鼻先
      c.roundRect(38, 72, 52, 36, 16, body);
      const mask = c.mask();
      c.ellipse(46, 56, 11, 13, "#f2c14e");
      c.ellipse(82, 56, 11, 13, "#f2c14e");
      c.ellipse(46, 58, 5, 8, OUTLINE);
      c.ellipse(82, 58, 5, 8, OUTLINE);
      c.clip(mask, () => {
        c.ellipse(52, 80, 4, 3, "#b02f18");
        c.ellipse(76, 80, 4, 3, "#b02f18");
        c.roundRect(44, 90, 40, 12, 5, OUTLINE);
        c.rect(50, 90, 6, 6, WHITE);
        c.rect(72, 90, 6, 6, WHITE);
        c.shadeBottom("#b02f18", 3, mask);
      });
    },
  },
  {
    id: "crown",
    labelJa: "おうかん",
    draw: (c) => {
      const gold = "#f2c14e";
      c.polygon(
        [
          [18, 96],
          [18, 34],
          [40, 62],
          [64, 26],
          [88, 62],
          [110, 34],
          [110, 96],
        ],
        gold,
      );
      const mask = c.mask();
      c.circle(18, 32, 8, "#e2453c");
      c.circle(64, 24, 8, "#3f8fd8");
      c.circle(110, 32, 8, "#e2453c");
      c.clip(mask, () => {
        c.roundRect(18, 78, 92, 18, 4, "#d9a52e");
        c.circle(44, 87, 6, "#e2453c");
        c.circle(64, 87, 6, "#3f8fd8");
        c.circle(84, 87, 6, "#e2453c");
        c.shadeBottom("#c08f1e", 3, mask);
      });
    },
  },
  {
    id: "book",
    labelJa: "ほん",
    draw: (c) => {
      const cover = "#3f6fd8";
      c.roundRect(12, 26, 104, 76, 8, cover);
      const mask = c.mask();
      c.clip(mask, () => {
        c.roundRect(18, 32, 42, 64, 4, "#f6f2e2");
        c.roundRect(68, 32, 42, 64, 4, "#f6f2e2");
        c.rect(60, 30, 8, 68, "#2b4ea8");
        for (const y of [44, 58, 72]) {
          c.rect(24, y, 30, 5, "#b9b3a0");
          c.rect(74, y, 30, 5, "#b9b3a0");
        }
        c.shadeBottom("#2b4ea8", 4, mask);
      });
    },
  },
  {
    id: "dice",
    labelJa: "サイコロ",
    draw: (c) => {
      c.roundRect(20, 20, 88, 88, 16, WHITE);
      const mask = c.mask();
      c.clip(mask, () => c.shadeBottom("#d8dae8", 4, mask));
      for (const [x, y] of [
        [42, 42],
        [86, 42],
        [64, 64],
        [42, 86],
        [86, 86],
      ]) {
        c.circle(x, y, 9, "#e2453c");
      }
    },
  },
];
