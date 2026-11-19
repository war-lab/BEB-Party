// モジュールテスト用の卓。共通コアと同じ規則で遷移を反映する（基本設計/01の GameTransition の反映）。
//
// - publicState / gameSecret / stage は返ったときだけ差し替える
// - secrets は playerId ごとに上書きで溜める（共通コアの playerSecrets と同じ。結合しない）
// - result が返ったら lifecycle を finished にする
// - reject は状態を変えない
//
// vi.mock はファイル単位で効くため、モジュールは呼び出し側が渡す。
import type { Player, Room } from "@beb/shared-core";
import type { TwoHeadedPublic, TwoHeadedResult, TwoHeadedSecret } from "@beb/shared-twoheaded";
import type { TwoHeadedGameSecret, twoHeadedModule } from "../module";

type Module = typeof twoHeadedModule;
export type Transition = ReturnType<Module["handleAction"]>;

export interface Live {
  lifecycle: Room["lifecycle"];
  players: Player[];
  stage: string;
  deadlineSeconds: number | undefined;
  contentId: string;
  publicState: TwoHeadedPublic;
  gameSecret: TwoHeadedGameSecret;
  /** 共通コアの playerSecrets と同じく、送った秘密情報を playerId ごとに上書きで溜めたもの */
  sent: Map<string, TwoHeadedSecret>;
  result: TwoHeadedResult | undefined;
  /** 直前の遷移が返した secrets（届いた相手を確かめるため） */
  lastSecrets: Map<string, TwoHeadedSecret> | undefined;
  lastReject: string | undefined;
}

export function roomOf(live: Live): Room {
  return {
    code: "AB12",
    lifecycle: live.lifecycle,
    players: live.players,
    gameId: "g",
    contentId: live.contentId,
    stage: live.stage,
  };
}

export function startLive(
  module: Module,
  players: Player[],
  options: { contentId: string; settings?: unknown; seed?: number; pinnedPairs?: [string, string][] },
): Live {
  const started = module.start({
    players,
    contentId: options.contentId,
    settings: options.settings,
    seed: options.seed ?? 4242,
    pinnedPairs: options.pinnedPairs,
  });
  return {
    lifecycle: "playing",
    players,
    stage: started.stage,
    deadlineSeconds: started.deadlineSeconds,
    contentId: options.contentId,
    publicState: started.publicState,
    gameSecret: started.gameSecret as TwoHeadedGameSecret,
    sent: new Map(started.secrets),
    result: undefined,
    lastSecrets: new Map(started.secrets),
    lastReject: undefined,
  };
}

export function apply(live: Live, transition: Transition): Live {
  if (transition.reject) {
    return { ...live, lastReject: transition.reject.code, lastSecrets: undefined };
  }
  const sent = new Map(live.sent);
  const secrets = transition.secrets as Map<string, TwoHeadedSecret> | undefined;
  for (const [playerId, secret] of secrets ?? []) {
    sent.set(playerId, secret);
  }
  return {
    ...live,
    lifecycle: transition.result !== undefined ? "finished" : live.lifecycle,
    stage: transition.stage ?? live.stage,
    deadlineSeconds: transition.stage !== undefined ? transition.deadlineSeconds : live.deadlineSeconds,
    publicState: transition.publicState ?? live.publicState,
    gameSecret: transition.gameSecret ?? live.gameSecret,
    sent,
    result: transition.result ?? live.result,
    lastSecrets: secrets,
    lastReject: undefined,
  };
}

export function act(module: Module, live: Live, playerId: string, action: string, payload?: unknown): Live {
  return apply(
    live,
    module.handleAction({
      room: roomOf(live),
      publicState: live.publicState,
      gameSecret: live.gameSecret,
      playerId,
      action,
      payload,
    }),
  );
}

export function expire(module: Module, live: Live): Live {
  return apply(live, module.onDeadline({ room: roomOf(live), publicState: live.publicState, gameSecret: live.gameSecret }));
}

/** 接続状態を変える。共通コアの切断検出の代わり */
export function setConnected(live: Live, playerIds: readonly string[], connected: boolean): Live {
  return {
    ...live,
    players: live.players.map((player) => (playerIds.includes(player.id) ? { ...player, connected } : player)),
  };
}

/** 現在の説明役のペアの members */
export function explainersOf(live: Live): string[] {
  const teamId = live.publicState.turnOrder[live.publicState.turnIndex];
  return live.publicState.teams.find((team) => team.teamId === teamId)?.members ?? [];
}

/** 説明役以外のペアの teamId の先頭 */
export function otherTeamIdOf(live: Live): string {
  const teamId = live.publicState.turnOrder[live.publicState.turnIndex];
  const other = live.publicState.teams.find((team) => team.teamId !== teamId);
  if (other === undefined) {
    throw new Error("説明役以外のペアが無い");
  }
  return other.teamId;
}

/** 全員が ready を送る */
export function readyAll(module: Module, live: Live): Live {
  let next = live;
  for (const player of live.players) {
    next = act(module, next, player.id, "ready");
  }
  return next;
}

/** 説明役のペアの先頭が startTurn を送る */
export function startTurn(module: Module, live: Live): Live {
  return act(module, live, explainersOf(live)[0] ?? "", "startTurn");
}

/** 表示中のお題で正解を申告する */
export function claim(module: Module, live: Live, teamId?: string, by?: string): Live {
  return act(module, live, by ?? explainersOf(live)[0] ?? "", "claimCorrect", {
    cardId: live.gameSecret.currentCardId,
    teamId: teamId ?? otherTeamIdOf(live),
  });
}

/** 表示中のお題を送る */
export function pass(module: Module, live: Live, by?: string): Live {
  return act(module, live, by ?? explainersOf(live)[0] ?? "", "passCard", { cardId: live.gameSecret.currentCardId });
}
