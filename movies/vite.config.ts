// Motion Canvasのビルド設定。
//
// vite-pluginのpeerが 4.x || 5.x のため、movies だけvite 5系を固定する（client/appは8系）。
// 動画は1080x1920の縦とし、スマホで見る前提に合わせる（解像度は各 src/projects/*.meta が持つ）。
// 1ゲーム=1プロジェクトにするのは、レンダリングの単位がプロジェクトだからである。
import ffmpegPkg from "@motion-canvas/ffmpeg";
import motionCanvasPkg from "@motion-canvas/vite-plugin";
import { defineConfig } from "vite";

// どちらのプラグインもCJSで publish されており、ESMのconfigから見ると default が1段深い。
// そのまま呼ぶと "motionCanvas is not a function" になる（実測）
type PluginFactory = (options?: unknown) => unknown;
function interop(mod: unknown): PluginFactory {
  const candidate = (mod as { default?: unknown }).default ?? mod;
  return candidate as PluginFactory;
}

const motionCanvas = interop(motionCanvasPkg);
const ffmpeg = interop(ffmpegPkg);

export default defineConfig({
  plugins: [
    motionCanvas({ project: ["./src/projects/*.ts"], output: "./output" }),
    ffmpeg(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any,
  // 撮影した実画面のPNGを素材として読む。assets/ 配下は生成物であり、コミットしない
  publicDir: "assets",
});
