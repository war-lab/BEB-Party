// E2E用のサーバを監督する。`wrangler dev` が異常終了したら再起動する。
//
// wrangler dev(4.122.0 / miniflare 5.20260811.0-alpha)は、ProxyWorkerで発生した
// "Network connection lost." を致命的なエラーとして扱い、空の `✘ [ERROR]` を出してプロセスごと終了する。
// 同じシグネチャの未修正の上流バグが報告されている（cloudflare/workers-sdk#15203、#14926）。
// E2Eは6コンテキストの同時接続と切断を短時間に繰り返すため、この終了を踏むことがある（CIとローカルの両方で実測）。
//
// Playwrightはブラウザ起動前の待ち受けだけを見ており、テスト中にwebServerが終了しても検知しない。
// そのため一度終了すると、以降の全テストが retry を含めて ERR_CONNECTION_REFUSED で落ちる。
// ここで再起動しておけば、巻き込まれるのはPlaywrightのretryで救えるテストだけに留まる。
//
// 再起動は本番の挙動と無関係で、`wrangler deploy` されるWorkerには影響しない。
import { spawn } from "node:child_process";

/** 連続で早期終了した回数の上限。設定不備やポート衝突で無限に再起動しないための歯止め */
const MAX_CONSECUTIVE_FAST_EXITS = 3;
/**
 * これより短い稼働は「起動に失敗した」と見なす（ミリ秒）。
 * 待ち受け開始までに10秒前後かかるため、稼働時間で起動失敗と稼働中のクラッシュを見分ける。
 * 待ち受けに至らない状態が続いた場合は、PlaywrightのwebServer待ち(60秒)が外側の歯止めになる
 */
const FAST_EXIT_MS = 5_000;
/** 再起動までの待ち時間。ポートの解放を待つ（ミリ秒） */
const RESTART_DELAY_MS = 1_000;

let child = null;
let shuttingDown = false;
let fastExits = 0;

function startWrangler() {
  const startedAt = Date.now();
  child = spawn("pnpm", ["--filter", "@beb/server-core", "run", "dev:e2e"], {
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code, signal) => {
    child = null;
    if (shuttingDown) return;

    const upFor = Date.now() - startedAt;
    fastExits = upFor < FAST_EXIT_MS ? fastExits + 1 : 0;

    if (fastExits >= MAX_CONSECUTIVE_FAST_EXITS) {
      console.error(
        `[e2e-server] wrangler devが${MAX_CONSECUTIVE_FAST_EXITS}回続けて${FAST_EXIT_MS}ms未満で終了した。再起動を打ち切る`,
      );
      process.exit(code ?? 1);
    }

    // この行はE2Eが落ちた原因の切り分けに使う。CIログに残るよう必ず出す
    console.error(
      `[e2e-server] wrangler devが終了した(code=${code} signal=${signal} 稼働${Math.round(upFor / 1000)}秒)。${RESTART_DELAY_MS}ms後に再起動する`,
    );
    setTimeout(startWrangler, RESTART_DELAY_MS);
  });
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    shuttingDown = true;
    child?.kill();
    process.exit(0);
  });
}

startWrangler();
