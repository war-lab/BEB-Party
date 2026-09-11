// 動画の共通部品。
//
// 映像の主役は「実アプリのスクリーンショット」であり、ここが持つのはその見せ方だけとする。
// 画面の中身を描き起こさない（撮った素材をそのまま出す）。
//
// 文字はすべて「行の配列」で受ける。自動折り返しに任せると助詞の途中で行が落ちるため、
// 改行位置は台本（shared/script.ts）が意味の区切りで決める（`textWrap` は使わない）。
import { Img, Layout, Node, Rect, Txt } from "@motion-canvas/2d";
import { createRef, type Reference } from "@motion-canvas/core";
import { COLOR, FONT, SIZE } from "./theme";

/** 1行分の文字列を並べたもの。要素の境界がそのまま改行位置になる */
export type Lines = readonly string[];

/** 字幕の書式。帯の高さを行数から決めるため、行の高さを共有する */
const CAPTION = { fontSize: 58, lineHeight: 84, maxWidth: SIZE.width - 120 } as const;

/** 撮影した実画面のPNGを引く。ファイル名は capture/shots.spec.ts の `shoot` の名前と同じ */
export function shotUrl(name: string): string {
  return `/shots/${name}.png`;
}

/**
 * 実画面を全面に出す。
 *
 * 素材は動画と同じ1080x1920で撮ってあるため、枠に入れて縮めると実画面の文字が読めない（実測）。
 * 端末の枠も付けない。全面に出す前提では枠が情報を持たず、実画面を削るだけである。
 */
export function Screen({ ref, shot }: { ref?: Reference<Img>; shot: string }) {
  return <Img ref={ref} src={shotUrl(shot)} width={SIZE.width} height={SIZE.height} />;
}

/**
 * 字幕。画面下部の帯に置き、実画面へ重ねる。
 *
 * 帯を不透明にするのは、実画面の下部に何が写っていても読めるようにするためである。
 * 帯の高さは行数から決める。行数が変わっても文字が帯からはみ出さない。
 */
export function Caption({ ref, lines, accent }: { ref?: Reference<Layout>; lines: Lines; accent: string }) {
  const height = lines.length * CAPTION.lineHeight + 76;
  return (
    <Layout ref={ref} y={SIZE.height / 2 - height / 2 - 56} opacity={0}>
      <Rect width={SIZE.width} height={height} fill={COLOR.ground} opacity={0.94} />
      <Rect width={SIZE.width} height={8} y={-height / 2} fill={accent} />
      <Layout direction="column" alignItems="center" gap={CAPTION.lineHeight - CAPTION.fontSize} layout>
        {lines.map((line) => (
          <Txt text={line} fill={COLOR.panel} fontFamily={FONT.body} fontWeight={700} fontSize={CAPTION.fontSize} />
        ))}
      </Layout>
    </Layout>
  );
}

/** 字幕が収まる幅。行が長い台本を書いたときに縮める判断に使う */
export const CAPTION_MAX_WIDTH = CAPTION.maxWidth;

/** タイトル札。ゲーム名とアイコンと一行説明 */
export function TitleCard({
  ref,
  icon,
  title,
  tagline,
  accent,
}: {
  ref?: Reference<Layout>;
  icon: string;
  title: Lines;
  tagline: Lines;
  accent: string;
}) {
  return (
    <Layout ref={ref} direction="column" alignItems="center" gap={56} layout opacity={0}>
      <Txt text={icon} fontSize={240} fontFamily={FONT.body} />
      <Layout direction="column" alignItems="center" gap={16} layout>
        {title.map((line) => (
          <Txt text={line} fill={COLOR.panel} fontFamily={FONT.display} fontSize={92} />
        ))}
      </Layout>
      <Rect fill={accent} radius={999} padding={[24, 48]} layout direction="column" alignItems="center" gap={10}>
        {tagline.map((line) => (
          <Txt text={line} fill={COLOR.ink} fontFamily={FONT.body} fontWeight={700} fontSize={46} />
        ))}
      </Rect>
    </Layout>
  );
}

/** 見出し付きの箇条書き。得点と約束に使う */
export function ListCard({
  ref,
  heading,
  items,
  accent,
}: {
  ref?: Reference<Layout>;
  heading: string;
  items: readonly Lines[];
  accent: string;
}) {
  return (
    <Layout ref={ref} direction="column" alignItems="center" gap={48} layout opacity={0}>
      <Rect fill={accent} radius={999} padding={[18, 52]} layout>
        <Txt text={heading} fill={COLOR.ink} fontFamily={FONT.body} fontWeight={700} fontSize={52} />
      </Rect>
      {items.map((lines) => (
        <Rect
          fill={COLOR.ground2}
          radius={24}
          padding={[30, 38]}
          stroke={accent}
          lineWidth={4}
          layout
          direction="column"
          alignItems="center"
          gap={16}
        >
          {lines.map((line) => (
            <Txt text={line} fill={COLOR.panel} fontFamily={FONT.body} fontWeight={700} fontSize={52} />
          ))}
        </Rect>
      ))}
    </Layout>
  );
}

/** 子孫のTxtを集める。大きさを測って収める処理で使う */
export function textsOf(node: Node): Txt[] {
  const found: Txt[] = [];
  const walk = (target: Node): void => {
    for (const child of target.children()) {
      if (child instanceof Txt) {
        found.push(child);
      } else {
        walk(child);
      }
    }
  };
  walk(node);
  return found;
}

/**
 * はみ出す行があれば、その節の文字を一律で縮める。
 *
 * 台本の改行位置を優先し、幅に収まらない場合だけ字を小さくする。
 * 自動折り返しに任せると意味の途中で行が落ちるため、折り返しはしない（実測で
 * ゲーム名が画面外へ出て、下の説明と重なった）。
 */
export function fitWithin(node: Node, maxWidth: number): void {
  const texts = textsOf(node);
  let widest = 0;
  for (const text of texts) {
    widest = Math.max(widest, text.width());
  }
  if (widest <= maxWidth || widest === 0) {
    return;
  }
  const ratio = maxWidth / widest;
  for (const text of texts) {
    text.fontSize(Math.floor(text.fontSize() * ratio));
  }
}

/** 参照を作る補助。シーン側の宣言を短くするだけ */
export function ref<T>(): Reference<T> {
  return createRef<T>();
}
