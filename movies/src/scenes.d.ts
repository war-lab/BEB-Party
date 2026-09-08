// vite-plugin が `?scene` 付きインポートを FullSceneDescription へ変換する。
// TypeScriptはこのクエリ付きの解決を知らないため、型だけを宣言する。
declare module "*?scene" {
  import type { FullSceneDescription } from "@motion-canvas/core";

  const scene: FullSceneDescription;
  export default scene;
}
