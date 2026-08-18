// サーバ時刻に合わせた残り時間の算出（基本設計/02のタイマー表示）。
//
// タイマーを描く画面が複数あるため、補正の規則をここ1箇所に閉じる。
// 補正値を毎秒測り直すと、補正後の時刻が受信時のサーバ時刻に固定されて残り時間が減らない。
import { serverState } from "./stores/server-state.svelte";

export interface ServerClock {
  /** 締切までの残り秒。締切が無ければnull。0未満にはならない */
  remaining(deadline: number | undefined): number | null;
}

/**
 * コンポーネントの初期化中に呼ぶ。毎秒の再描画と、`state` 受信時のオフセット更新を登録する。
 *
 * 残り0秒は表示上の値であり、ステージ遷移は必ずサーバの `state` で行う（基本設計/02の禁止事項）。
 */
export function createServerClock(): ServerClock {
  let now = $state(Date.now());
  // 端末時計とサーバ時刻のずれ。stateを受けた時点で1回だけ測る
  let clockOffset = $state(0);

  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    const serverNow = serverState.serverNow;
    if (serverNow !== null) {
      clockOffset = serverNow - Date.now();
    }
  });

  return {
    remaining(deadline: number | undefined): number | null {
      if (deadline === undefined) {
        return null;
      }
      return Math.max(0, Math.ceil((deadline - (now + clockOffset)) / 1000));
    },
  };
}

/** 残り秒を mm:ss にする */
export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
