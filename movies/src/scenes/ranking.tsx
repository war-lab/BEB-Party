// ranking の遊び方ムービー。
//
// vite-plugin が `?scene` 付きインポートで1ファイル=1シーンに変換するため、
// ここは薄い包みとし、中身は shared/howto.tsx に集約する。
import { makeScene2D } from "@motion-canvas/2d";
import { howTo } from "../shared/howto";
import { scriptOf } from "../shared/script";

export default makeScene2D(function* (view) {
  yield* howTo(view, scriptOf("ranking"));
});
