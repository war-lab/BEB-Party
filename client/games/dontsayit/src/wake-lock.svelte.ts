// Screen Wake Lock API。説明タイム中のスリープを抑止する（基本設計/02）。
//
// 重複の記録: client/games/detectives/src/wake-lock.svelte.ts と同一の実装である。
// 抽出の判断は実装計画のPR-5で行う。
// 非対応ブラウザでは何もしない。例外を投げてはならない。

// 型定義はTypeScriptのDOMライブラリのバージョンに依存するため、必要な形だけを自前で持つ
interface WakeLockSentinelLike {
  release(): Promise<void>;
}
interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  const candidate = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
  return typeof candidate?.request === "function" ? candidate : undefined;
}

/**
 * Wake Lockを取得し、解除関数を返す。
 *
 * 非対応・取得失敗（バックグラウンドタブ等）でも何も起きないだけとする。
 */
export function acquireWakeLock(): () => void {
  const api = wakeLockApi();
  if (api === undefined) {
    return () => {};
  }

  let sentinel: WakeLockSentinelLike | null = null;
  let released = false;

  api
    .request("screen")
    .then((granted) => {
      if (released) {
        void granted.release().catch(() => {});
        return;
      }
      sentinel = granted;
    })
    .catch(() => {
      // 取得できない環境では何もしない
    });

  return () => {
    released = true;
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
