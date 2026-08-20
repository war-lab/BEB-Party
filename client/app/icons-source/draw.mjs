// アイコンを描くための最小のラスタ描画。128x128の格子に、補間なしで図形を置く。
//
// 128x128をマスごとに手で置くのは現実的でないため、円・楕円・角丸・多角形の重ね合わせで描く。
// 補間（アンチエイリアス）はしない。境界がはっきりした面で構成し、色数を抑えるためである
// （PNGが小さくなり、SVGへ書き出したときの矩形数も減る）。

export class Canvas {
  /**
   * @param base 描画コードが使う座標系の一辺（128）
   * @param scale 出力の倍率。座標と半径をこの倍率で拡大する。
   *   同じ描画コードから任意の解像度を出すためにあり、投影用に大きく書き出すときに使う
   */
  constructor(base, scale = 1) {
    this.scale = scale;
    this.size = base * scale;
    /** 各マスの色（`null` は透明） */
    this.cells = new Array(this.size * this.size).fill(null);
    /** 描画範囲の制限。非nullのときはtrueのマスにしか置かない */
    this.clipMask = null;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  set(x, y, color) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (!this.inside(ix, iy)) {
      return;
    }
    const at = iy * this.size + ix;
    if (this.clipMask && !this.clipMask[at]) {
      return;
    }
    this.cells[at] = color;
  }

  get(x, y) {
    return this.inside(x, y) ? this.cells[y * this.size + x] : null;
  }

  /** 現在の不透明部分をマスクとして返す */
  mask() {
    return this.cells.map((color) => color !== null);
  }

  /** マスク内だけに描く。描画関数を渡して抜ける（入れ子にはしない） */
  clip(mask, draw) {
    const previous = this.clipMask;
    this.clipMask = mask;
    draw();
    this.clipMask = previous;
  }

  rect(x, y, w, h, color) {
    const k = this.scale;
    for (let iy = Math.round(y * k); iy < Math.round(y * k) + h * k; iy += 1) {
      for (let ix = Math.round(x * k); ix < Math.round(x * k) + w * k; ix += 1) {
        this.set(ix, iy, color);
      }
    }
  }

  /** 楕円の塗り。中心と半径で指定する */
  ellipse(cx0, cy0, rx0, ry0, color) {
    const k = this.scale;
    const cx = cx0 * k;
    const cy = cy0 * k;
    const rx = rx0 * k;
    const ry = ry0 * k;
    for (let iy = Math.floor(cy - ry); iy <= Math.ceil(cy + ry); iy += 1) {
      for (let ix = Math.floor(cx - rx); ix <= Math.ceil(cx + rx); ix += 1) {
        const dx = (ix + 0.5 - cx) / rx;
        const dy = (iy + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          this.set(ix, iy, color);
        }
      }
    }
  }

  circle(cx, cy, r, color) {
    this.ellipse(cx, cy, r, r, color);
  }

  /** 角丸の四角。rは角の半径。座標は描画コードの座標系のまま渡す */
  roundRect(x, y, w, h, r, color) {
    this.rect(x + r, y, w - 2 * r, h, color);
    this.rect(x, y + r, w, h - 2 * r, color);
    this.ellipse(x + r, y + r, r, r, color);
    this.ellipse(x + w - r, y + r, r, r, color);
    this.ellipse(x + r, y + h - r, r, r, color);
    this.ellipse(x + w - r, y + h - r, r, r, color);
  }

  /** 多角形の塗り。頂点は[[x,y],...]。走査線ごとに交点を求める */
  polygon(points0, color) {
    const points = points0.map(([x, y]) => [x * this.scale, y * this.scale]);
    const ys = points.map((p) => p[1]);
    const top = Math.floor(Math.min(...ys));
    const bottom = Math.ceil(Math.max(...ys));
    for (let y = top; y <= bottom; y += 1) {
      const crossings = [];
      for (let i = 0; i < points.length; i += 1) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if (y1 === y2) {
          continue;
        }
        const cy = y + 0.5;
        if ((cy >= y1 && cy < y2) || (cy >= y2 && cy < y1)) {
          crossings.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        for (let x = Math.round(crossings[i]); x < Math.round(crossings[i + 1]); x += 1) {
          this.set(x, y, color);
        }
      }
    }
  }

  /** 太さのある線。座標は描画コードの座標系のまま渡す */
  line(x1, y1, x2, y2, width, color) {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * this.scale) * 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, color);
    }
  }

  /**
   * いま描かれている形の外周に輪郭を足す。
   *
   * 透明なマスのうち、半径 thickness 以内に不透明なマスがあるものを輪郭色で塗る。
   * 形を描き終えたあとに1回だけ呼ぶ。
   */
  outline(color, thickness0) {
    const thickness = Math.round(thickness0 * this.scale);
    const offsets = [];
    for (let dy = -thickness; dy <= thickness; dy += 1) {
      for (let dx = -thickness; dx <= thickness; dx += 1) {
        if (dx * dx + dy * dy <= thickness * thickness) {
          offsets.push([dx, dy]);
        }
      }
    }
    const filled = this.cells.map((c) => c !== null);
    const next = this.cells.slice();
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        const at = y * this.size + x;
        if (filled[at]) {
          continue;
        }
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < this.size && ny < this.size && filled[ny * this.size + nx]) {
            next[at] = color;
            break;
          }
        }
      }
    }
    this.cells = next;
  }

  /** 影を1段だけ落とす。下側の縁を暗い色にする（面の向きを出すため） */
  shadeBottom(color, depth0, mask) {
    const depth = Math.max(1, Math.round(depth0 * this.scale));
    const filled = mask ?? this.mask();
    const next = this.cells.slice();
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        const at = y * this.size + x;
        if (!filled[at]) {
          continue;
        }
        let bottom = true;
        for (let d = 1; d <= depth; d += 1) {
          if (y + d < this.size && filled[(y + d) * this.size + x]) {
            bottom = false;
            break;
          }
        }
        if (bottom) {
          next[at] = color;
        }
      }
    }
    this.cells = next;
  }
}
