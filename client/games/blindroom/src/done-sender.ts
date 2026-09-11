// 完了申告の送信（基本設計/12_BLINDROOMゲームモジュール.md の done）。
//
// 盤面の送信は間引かれるが（place-sender.ts）、`done` は間引かれずに届く。
// 申告の前に保留の盤面を送らないと、`done` が `place` を追い越し、サーバは1手前の盤面で
// 採点する。最後の聞き手の申告なら、その盤面のまま採点が確定する。
//
// この順序は「押したとき」と「再接続で送り直すとき」の両方で要る。
// 再接続の側だけ `done` を送っていた欠陥をPR #31のレビューで指摘された。
import { sendAction } from "@beb/client-core";
import { ACTIONS } from "@beb/shared-blindroom";
import type { PlaceSender } from "./place-sender";

export interface DoneSender {
  /** 申告する（ボタンを押したとき） */
  declare: (round: number, done: boolean) => void;
  /**
   * 接続が戻ったときに送り直す。
   *
   * `sendAction` は未接続のとき送らずに戻るため（基本設計/02）、押した瞬間に接続が
   * 切れていると申告が消え、締切まで場が止まる。サーバの状態と食い違うときだけ送る。
   */
  resend: (round: number, serverDone: boolean) => void;
  /** 記録した意思。ラウンドが変わると無効になる */
  readonly intent: { round: number; done: boolean } | null;
}

export function createDoneSender(place: PlaceSender): DoneSender {
  let intent: { round: number; done: boolean } | null = null;

  function send(done: boolean): void {
    place.flush();
    sendAction(ACTIONS.done, { done });
  }

  return {
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
    get intent() {
      return intent;
    },
  };
}
