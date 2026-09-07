// 遊び方ムービーの本体。4本とも同じ構成で、台本（shared/script.ts）だけを差し替える。
//
// 映像の主役は撮影した実画面である。ここが持つのは見せ方（間・切り替え・字幕）だけとし、
// 画面の中身を描き起こさない。1枚に主張を1つだけ置き、読み切れる長さで止める。
//
// ステージ名の札は置かない。実画面の上端にタイマーバーがあり、そこに同じ語が出ているためである。
import { Img, Layout, type View2D } from "@motion-canvas/2d";
import { all, createRef, waitFor, type ThreadGenerator } from "@motion-canvas/core";
import { Caption, ListCard, Screen, TitleCard, shotUrl } from "./parts";
import type { MovieScript } from "./script";
import { COLOR, GAME_ACCENT } from "./theme";

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
  yield* showPurpose(view, script, accent);
  yield* showBeats(view, script, accent);
  yield* showList(view, "得点", script.scoring, accent);
  yield* showList(view, "守ること", script.promises, COLOR.red);
  yield* waitFor(0.6);
}

/** 冒頭。ゲーム名を出して寄る */
function* showTitle(view: View2D, script: MovieScript, accent: string): ThreadGenerator {
  const holder = createRef<Layout>();
  view.add(
    <Layout ref={holder} opacity={0}>
      <TitleCard icon={script.icon} title={script.title} tagline={script.tagline} accent={accent} />
    </Layout>,
  );
  yield* holder().opacity(1, 0.5);
  yield* holder().scale(1.05, 1.8);
  yield* waitFor(0.5);
  yield* holder().opacity(0, 0.4);
  holder().remove();
}

/** 目的。1枚だけ置く */
function* showPurpose(view: View2D, script: MovieScript, accent: string): ThreadGenerator {
  const holder = createRef<Layout>();
  view.add(<ListCard ref={holder} heading="どんなゲーム？" lines={[script.purpose]} accent={accent} />);
  yield* holder().opacity(1, 0.5);
  yield* waitFor(2.8);
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
  view.add(<Caption ref={caption} text={first.caption} accent={accent} />);
  screen().opacity(0);
  yield* all(screen().opacity(1, 0.4), caption().opacity(1, 0.4));
  yield* hold(screen, first.hold);

  for (const beat of script.beats.slice(1)) {
    // 一度暗くしてから差し替える。切り替わりを目で追えるようにする
    yield* all(caption().opacity(0, 0.22), screen().opacity(0.15, 0.22));
    screen().src(shotUrl(beat.shot));
    setCaption(caption, beat.caption);
    yield* all(screen().opacity(1, 0.28), caption().opacity(1, 0.28));
    yield* hold(screen, beat.hold);
  }

  yield* all(screen().opacity(0, 0.4), caption().opacity(0, 0.3));
  screen().remove();
  caption().remove();
}

/** 静止画のまま止めない。わずかに寄せて、映像が固まって見えないようにする */
function* hold(screen: ReturnType<typeof createRef<Img>>, seconds: number): ThreadGenerator {
  yield* screen().scale(1.02, seconds);
  screen().scale(1);
}

/** 字幕の差し替え。帯（Rect2枚）の後ろにTxtが1つある構造に依存する */
function setCaption(holder: ReturnType<typeof createRef<Layout>>, text: string): void {
  const txt = holder()
    .children()
    .find((child) => "text" in child);
  if (txt !== undefined) {
    (txt as unknown as { text: (value: string) => void }).text(text);
  }
}

/** 得点・約束の箇条書きを1枚に出す。行数に応じて表示時間を伸ばす */
function* showList(view: View2D, heading: string, lines: string[], accent: string): ThreadGenerator {
  const holder = createRef<Layout>();
  view.add(<ListCard ref={holder} heading={heading} lines={lines} accent={accent} />);
  yield* holder().opacity(1, 0.5);
  yield* waitFor(1.2 + lines.length * 1.5);
  yield* holder().opacity(0, 0.4);
  holder().remove();
}
