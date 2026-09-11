// 盤面と完了申告の送信（基本設計/12_BLINDROOMゲームモジュール.md の place / done）。
//
// 2つの不変条件を1つのオブジェクトが持つ。どちらも画面側の呼び出し順に頼ると壊れるため、
// 「置く」と「申告する」をここでしか呼べない形にしてある。
//
// 1. 申告の前に保留の盤面を送る。`place` は間引かれるが `done` は間引かれずに届くため、
//    順序を守らないとサーバは1手前の盤面で採点する。最後の聞き手の申告なら確定する。
//    再接続で送り直すときも同じ順序が要る（PR #31のレビュー指摘）。
// 2. 盤面を置いたら申告の意思を捨てる。サーバは `place` を受理した時点でその人の `done` を
//    取り消すため、意思を残すと再接続時に「サーバの取り消し」を「送信の欠落」と取り違え、
//    本人が押していない申告を送ってしまう。最後の未申告者なら、直している最中に採点が確定する。
import { sendAction } from "@beb/client-core";
import { ACTIONS, type Board } from "@beb/shared-blindroom";
import type { PlaceSender } from "./place-sender";

export interface BoardSender {
  /** 盤面を置く。送信は間引かれ、申告の意思は捨てられる */
  place: (roundIndex: number, cells: Board) => void;
  /** 申告する（ボタンを押したとき） */
  declare: (round: number, done: boolean) => void;
  /**
   * 接続が戻ったときに送り直す。
   *
   * `sendAction` は未接続のとき送らずに戻るため（基本設計/02）、押した瞬間に接続が
   * 切れていると申告が消え、締切まで場が止まる。サーバの状態と食い違うときだけ送る。
   */
  resend: (round: number, serverDone: boolean) => void;
  /** 画面を離れるときに呼ぶ */
  dispose: () => void;
  /** 記録した意思。ラウンドが変わると無効になる */
  readonly intent: { round: number; done: boolean } | null;
}

export function createBoardSender(place: PlaceSender): BoardSender {
  let intent: { round: number; done: boolean } | null = null;

  function send(done: boolean): void {
    place.flush();
    sendAction(ACTIONS.done, { done });
  }

  return {
    place(roundIndex: number, cells: Board): void {
      intent = null;
      place.send(roundIndex, cells);
    },
    declare(round: number, done: boolean): void {
      intent = { round, done };
      send(done);
    },
    resend(round: number, serverDone: boolean): void {
      if (intent === null || intent.round !== round || intent.done === serverDone) {
        return;
      }
      send(intent.done);
    },
    dispose(): void {
      place.dispose();
    },
    get intent() {
      return intent;
    },
  };
}
