// 盤面の送信を間引く（基本設計/12_BLINDROOMゲームモジュール.md の place）。
//
// タップのたびに送ると、ソケットあたりの流量制限（10秒で20通。ADR-0017）に触れる。
// 超えた時点で以降の place が落ち、盤面がサーバ側で古いまま締切を迎える。
//
// 送るのは常に9マスの現在値であり、間引いて捨てた中間状態は結果に影響しない。
import { sendAction } from "@beb/client-core";
import { ACTIONS, type Board } from "@beb/shared-blindroom";

/** 最短の送信間隔 */
const MIN_INTERVAL_MS = 1000;
/** 最後の操作から送るまでの待ち */
const TRAILING_MS = 400;

export interface PlaceSender {
  /** 盤面の現在値を送る（間引かれる） */
  send: (cells: Board) => void;
  /**
   * 保留中の1件をすぐ送る。
   *
   * 完了申告の前に必ず呼ぶ。done は間引かれずに届くため、最後の1手が保留のままだと
   * サーバは1手前の盤面で採点する。
   */
  flush: () => void;
  /** 画面を離れるときに呼ぶ。保留中の1件を送ってからタイマーを止める */
  dispose: () => void;
}

export function createPlaceSender(now: () => number = () => Date.now()): PlaceSender {
  let pending: Board | null = null;
  let lastSentAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    timer = null;
    if (pending === null) {
      return;
    }
    const cells = pending;
    // 未接続なら送らずに保留を残す。復帰後の操作かdisposeで送り直す（sendActionはfalseを返す）
    if (sendAction(ACTIONS.place, { cells })) {
      pending = null;
      lastSentAt = now();
      return;
    }
    schedule();
  }

  function schedule(): void {
    if (timer !== null) {
      return;
    }
    const wait = Math.max(TRAILING_MS, MIN_INTERVAL_MS - (now() - lastSentAt));
    timer = setTimeout(flush, wait);
  }

  /**
   * 保留を今すぐ送る。
   *
   * 送れなかったときに保留を捨てない。`sendAction` は未接続なら送らずに false を返すため
   * （[基本設計/02](../../../docs/基本設計/02_クライアント.md)）、捨てると再接続後に
   * 盤面が1手前のままサーバに残る。retry が true なら再送を予約する。
   */
  function sendNow(retry: boolean): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending === null) {
      return;
    }
    if (sendAction(ACTIONS.place, { cells: pending })) {
      pending = null;
      lastSentAt = now();
      return;
    }
    if (retry) {
      schedule();
    }
  }

  return {
    send(cells: Board): void {
      pending = [...cells];
      schedule();
    },
    flush: () => sendNow(true),
    // 画面を離れるときは予約を残さない。次のステージで届いても受理されない
    dispose: () => sendNow(false),
  };
}
