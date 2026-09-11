// blindroom の遊び方ムービー（1プロジェクト=1本）。
//
// プロジェクトを分けるのは、レンダリングの単位がプロジェクトだからである。
// 1プロジェクトに全シーンを入れると、エディタで範囲を指定しないと1本ずつ出せず、
// その範囲をUIから読む手段が無い（window.projectは露出していない。実測）。
import { makeProject } from "@motion-canvas/core";
import scene from "../scenes/blindroom?scene";
import "../shared/fonts.css";

export default makeProject({ name: "blindroom", scenes: [scene] });
