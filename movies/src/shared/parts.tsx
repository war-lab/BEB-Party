// 動画の共通部品。
//
// 映像の主役は「実アプリのスクリーンショット」であり、ここが持つのはその見せ方だけとする。
// 画面の中身を描き起こさない（撮った素材をそのまま出す）。
import { Img, Layout, Rect, Txt } from "@motion-canvas/2d";
import { createRef, type Reference } from "@motion-canvas/core";
import { COLOR, FONT, SIZE } from "./theme";

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
 * 1枚に1つの主張だけを置く。
 */
export function Caption({ ref, text, accent }: { ref?: Reference<Layout>; text: string; accent: string }) {
  return (
    <Layout ref={ref} y={SIZE.height / 2 - 210} opacity={0}>
      <Rect width={SIZE.width} height={300} fill={COLOR.ground} opacity={0.94} />
      <Rect width={SIZE.width} height={8} y={-150} fill={accent} />
      <Txt
        text={text}
        fill={COLOR.panel}
        fontFamily={FONT.body}
        fontWeight={700}
        fontSize={58}
        lineHeight={84}
        textWrap
        maxWidth={SIZE.width - 120}
        textAlign="center"
      />
    </Layout>
  );
}

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
  title: string;
  tagline: string;
  accent: string;
}) {
  return (
    <Layout ref={ref} direction="column" alignItems="center" gap={48} layout>
      <Txt text={icon} fontSize={240} fontFamily={FONT.body} />
      <Txt
        text={title}
        fill={COLOR.panel}
        fontFamily={FONT.display}
        fontSize={92}
        textWrap
        maxWidth={940}
        textAlign="center"
      />
      <Rect fill={accent} radius={999} padding={[20, 48]} layout>
        <Txt
          text={tagline}
          fill={COLOR.ink}
          fontFamily={FONT.body}
          fontWeight={700}
          fontSize={46}
          textWrap
          maxWidth={860}
          textAlign="center"
        />
      </Rect>
    </Layout>
  );
}

/** 見出し付きの箇条書き。得点と約束に使う */
export function ListCard({
  ref,
  heading,
  lines,
  accent,
}: {
  ref?: Reference<Layout>;
  heading: string;
  lines: string[];
  accent: string;
}) {
  return (
    <Layout ref={ref} direction="column" alignItems="center" gap={56} layout opacity={0}>
      <Rect fill={accent} radius={999} padding={[18, 52]} layout>
        <Txt text={heading} fill={COLOR.ink} fontFamily={FONT.body} fontWeight={700} fontSize={52} />
      </Rect>
      {lines.map((line) => (
        <Rect fill={COLOR.ground2} radius={24} padding={[30, 38]} stroke={accent} lineWidth={4} layout>
          <Txt
            text={line}
            fill={COLOR.panel}
            fontFamily={FONT.body}
            fontWeight={700}
            fontSize={52}
            lineHeight={78}
            textWrap
            maxWidth={860}
            textAlign="center"
          />
        </Rect>
      ))}
    </Layout>
  );
}

/** 参照を作る補助。シーン側の宣言を短くするだけ */
export function ref<T>(): Reference<T> {
  return createRef<T>();
}
