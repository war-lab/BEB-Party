// 遊び方ムービーの本体。4本とも同じ構成で、台本（shared/script.ts）だけを差し替える。
//
// 映像の主役は撮影した実画面である。ここが持つのは見せ方（間・切り替え・字幕）だけとし、
// 画面の中身を描き起こさない。1枚に主張を1つだけ置き、読み切れる長さで止める。
//
// 拡大（ズームイン）は入れない。実画面の文字が動くと読みにくく、寄る意味もない。
// ステージ名の札も置かない。実画面の上端にタイマーバーがあり、そこに同じ語が出ているためである。
import { Img, Layout, type View2D } from "@motion-canvas/2d";
import { all, createRef, waitFor, type ThreadGenerator } from "@motion-canvas/core";
import { CAPTION_MAX_WIDTH, Caption, ListCard, Screen, TitleCard, fitWithin, shotUrl, type Lines } from "./parts";
import type { MovieScript } from "./script";
import { COLOR, GAME_ACCENT, SIZE } from "./theme";

/** 札の中身が収まる幅。タイトル札と箇条書きで共通に使う */
const CARD_MAX_WIDTH = SIZE.width - 140;

/**
 * 1本分の映像を組む。
 *
 * makeScene2D はシーン1つにつき1ファイルを要求する（vite-pluginが `?scene` で変換する）。
 * そのため各シーンファイルは薄い包みにし、中身はこの関数に集約する。
 */
export function* howTo(view: View2D, script: MovieScript): ThreadGenerator {
  const accent = GAME_ACCENT[script.id];
  view.fill(COLOR.ground);

  yield* showTitle(view, script, accent);
  yield* showList(view, "どんなゲーム？", [script.purpose], accent);
  yield* showBeats(view, script, accent);
  yield* showList(view, "得点", script.scoring, accent);
  yield* showList(view, "守ること", script.promises, COLOR.red);
  yield* waitFor(0.6);
}

/** 冒頭。ゲーム名を出す */
function* showTitle(view: View2D, script: MovieScript, accent: string): ThreadGenerator {
  const holder = createRef<Layout>();
  view.add(
    <TitleCard
      ref={holder}
      icon={script.icon}
      title={script.title}
      tagline={script.tagline}
      accent={accent}
    />,
  );
  fitWithin(holder(), CARD_MAX_WIDTH);
  yield* holder().opacity(1, 0.5);
  yield* waitFor(2.3);
  yield* holder().opacity(0, 0.4);
  holder().remove();
}

/** 各ステージ。撮った実画面を全面に出し、字幕を下部へ重ねる */
function* showBeats(view: View2D, script: MovieScript, accent: string): ThreadGenerator {
  const screen = createRef<Img>();
  const caption = createRef<Layout>();

  const first = script.beats[0];
  if (first === undefined) {
    return;
  }

  // 実画面 → 字幕の順に足す。後に足した方が上に描かれ、字幕が実画面へ重なる
  view.add(<Screen ref={screen} shot={first.shot} />);
  screen().opacity(0);
  view.add(<Caption ref={caption} lines={first.caption} accent={accent} />);
  fitWithin(caption(), CAPTION_MAX_WIDTH);
  yield* all(screen().opacity(1, 0.4), caption().opacity(1, 0.4));
  yield* waitFor(first.hold);

  for (const beat of script.beats.slice(1)) {
    // 一度暗くしてから差し替える。切り替わりを目で追えるようにする
    yield* all(caption().opacity(0, 0.22), screen().opacity(0.15, 0.22));
    screen().src(shotUrl(beat.shot));
    // 字幕は行数が変わると帯の高さも変わるため、作り直す
    caption().remove();
    view.add(<Caption ref={caption} lines={beat.caption} accent={accent} />);
    fitWithin(caption(), CAPTION_MAX_WIDTH);
    yield* all(screen().opacity(1, 0.28), caption().opacity(1, 0.28));
    yield* waitFor(beat.hold);
  }

  yield* all(screen().opacity(0, 0.4), caption().opacity(0, 0.3));
  screen().remove();
  caption().remove();
}

/** 箇条書きを1枚に出す。行数に応じて表示時間を伸ばす */
function* showList(view: View2D, heading: string, items: readonly Lines[], accent: string): ThreadGenerator {
  const holder = createRef<Layout>();
  view.add(<ListCard ref={holder} heading={heading} items={items} accent={accent} />);
  fitWithin(holder(), CARD_MAX_WIDTH);
  yield* holder().opacity(1, 0.5);
  yield* waitFor(1.2 + items.reduce((total, lines) => total + lines.length, 0) * 0.9);
  yield* holder().opacity(0, 0.4);
  holder().remove();
}
