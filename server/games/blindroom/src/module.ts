// BLIND ROOMのGameModule実装（基本設計/12_BLINDROOMゲームモジュール.md）。
//
// handleAction と onDeadline は純粋関数として書く。storage・WebSocket・時刻取得・Math.random に触らない。
// 乱数は共通コアが注入する seed からのみ作る（基本設計/05の呼び出し規約）。
import {
  ACTIONS,
  BOARD_SIZES,
  BOARD_SIZE_IDS,
  BUILDING_SECONDS,
  DEFAULT_BOARD_SIZE_ID,
  ERROR_CODES,
  PLACE_COUNT,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  cellCountOf,
  countMatches,
  describerPlayerIdOf,
  describerPointsOf,
  emptyBoard,
  generateSample,
  hasDuplicateItem,
  hintCountFor,
  isBoard,
  isBoardSizeId,
  isFinalRound,
  placedCount,
  placedItemIds,
  tierFor,
  type BlindRoomPack,
  type BlindRoomPublic,
  type BlindRoomResult,
  type BlindRoomSecret,
  type BlindRoomSettings,
  type Board,
  type BoardResult,
  type ItemSet,
  type ListenerSecret,
  type PaletteItem,
  type RoundRecord,
  type ScoreEntry,
} from "@beb/shared-blindroom";
import {
  createRandom,
  shuffle,
  type ContentSummary,
  type GameModule,
  type GameTransition,
  type Level,
  type Player,
  type Room,
  type ValidationResult,
} from "@beb/shared-core";
import { PACKS, findPack, summarize } from "./packs";
import { validateContent } from "./validate-content";

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015）。
 *
 * 見本と、配置中の聞き手の盤面を公開状態に置けない。見本が見えると説明が要らなくなり、
 * 他人の盤面が見えると説明を聞かずに写せる（12の公開状態）。
 */
export interface BlindRoomGameSecret {
  /** ラウンドごとのアイテムセットid。説明者のレベルから開始時に決める */
  itemSetIds: string[];
  /** ラウンドごとの見本。開始時に全ラウンド分を生成する（ADR-0024） */
  samples: Board[];
  /** 現ラウンドの playerId -> 盤面。reveal で公開状態へ移して空へ戻す */
  boards: Record<string, Board>;
}

type Transition = GameTransition<BlindRoomPublic, BlindRoomResult, BlindRoomGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): BlindRoomSettings {
  const source = typeof settings === "object" && settings !== null ? (settings as Record<string, unknown>) : {};
  const seconds = source.buildingSeconds;
  const sizeId = source.boardSizeId;
  return {
    buildingSeconds: typeof seconds === "number" ? seconds : BUILDING_SECONDS.default,
    boardSizeId: isBoardSizeId(sizeId) ? sizeId : DEFAULT_BOARD_SIZE_ID,
  };
}

function validateSettings(settings: unknown): ValidationResult {
  if (settings === undefined || settings === null) {
    return { valid: true };
  }
  if (typeof settings !== "object") {
    return { valid: false, reason: "settingsはオブジェクトである必要がある" };
  }
  const source = settings as Record<string, unknown>;

  if ("boardSizeId" in source && !isBoardSizeId(source.boardSizeId)) {
    return { valid: false, reason: `boardSizeIdは${BOARD_SIZE_IDS.join(" / ")}のいずれかである必要がある` };
  }

  if (!("buildingSeconds" in source)) {
    return { valid: true };
  }
  const value = source.buildingSeconds;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { valid: false, reason: "buildingSecondsは整数である必要がある" };
  }
  if (value < BUILDING_SECONDS.min || value > BUILDING_SECONDS.max) {
    return {
      valid: false,
      reason: `buildingSecondsは${BUILDING_SECONDS.min}以上${BUILDING_SECONDS.max}以下である必要がある`,
    };
  }
  return { valid: true };
}

// --- パックとアイテムセットの解決 ---

function resolvePack(packId: string): BlindRoomPack {
  const target = findPack(packId);
  if (target === undefined) {
    // 共通コアがconfigureとstartでcontentIdを検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録のお題パックid: ${packId}`);
  }
  return target;
}

function itemSetOf(pack: BlindRoomPack, itemSetId: string | undefined): ItemSet | undefined {
  return itemSetId === undefined ? undefined : pack.itemSets.find((entry) => entry.id === itemSetId);
}

/**
 * 説明者のレベルからアイテムセットを選ぶ（12のレベル差の吸収の第1層）。
 *
 * 検証2が両方の段の存在を保証するため、通常は該当セットが見つかる。
 * 見つからない場合は先頭のセットへ落とし、進行を止めない。
 */
function pickItemSetId(pack: BlindRoomPack, level: Level): string {
  const tier = tierFor(level);
  const matched = pack.itemSets.find((entry) => entry.tier === tier);
  return (matched ?? pack.itemSets[0])?.id ?? "";
}

function paletteOf(set: ItemSet | undefined): PaletteItem[] {
  return (set?.items ?? []).map((item) => ({ ...item }));
}

// --- 秘密情報 ---

function levelOf(players: readonly Player[], playerId: string | undefined): Level {
  return players.find((player) => player.id === playerId)?.level ?? 1;
}

function listenerSecretOf(roundIndex: number, board: Board): ListenerSecret {
  return { roundIndex, role: "listener", board: [...board] };
}

/**
 * そのラウンドの秘密情報を全員分作る。
 *
 * 共通コアは playerSecrets[playerId] をペイロードごと差し替えるため、常に全体を組み立てる。
 * handoff のたびに送り直すことで、前のラウンドの見本と盤面が手元に残らない（12の秘密情報）。
 */
function buildSecrets(
  players: readonly Player[],
  set: ItemSet | undefined,
  sample: Board,
  describerId: string | undefined,
  roundIndex: number,
  boards: Record<string, Board>,
  cellCount: number,
): Map<string, BlindRoomSecret> {
  const secrets = new Map<string, BlindRoomSecret>();
  const hints = set?.describerHints ?? [];
  for (const player of players) {
    if (player.id === describerId) {
      secrets.set(player.id, {
        roundIndex,
        role: "describer",
        sample: [...sample],
        hintEn: hints.slice(0, hintCountFor(player.level)),
      });
      continue;
    }
    secrets.set(player.id, listenerSecretOf(roundIndex, boards[player.id] ?? emptyBoard(cellCount)));
  }
  return secrets;
}

// --- 得点 ---

function addPoints(scores: readonly ScoreEntry[], playerId: string, delta: number): ScoreEntry[] {
  const exists = scores.some((entry) => entry.playerId === playerId);
  const updated = scores.map((entry) =>
    entry.playerId === playerId ? { ...entry, points: entry.points + delta } : entry,
  );
  return exists ? updated : [...updated, { playerId, points: delta }];
}

// --- 進行の補助 ---

function connectedPlayerIds(room: Room): string[] {
  return room.players.filter((player) => player.connected).map((player) => player.id);
}

function isParticipant(room: Room, playerId: string): boolean {
  return room.players.some((player) => player.id === playerId);
}

function isConnected(room: Room, playerId: string | undefined): boolean {
  return room.players.some((player) => player.id === playerId && player.connected);
}

function allConnectedIn(room: Room, collected: readonly string[]): boolean {
  const connected = connectedPlayerIds(room);
  return connected.length > 0 && connected.every((playerId) => collected.includes(playerId));
}

/** 説明者を除く接続中の全員が完了申告を出したか */
function allListenersDone(room: Room, collected: readonly string[], describerId: string | undefined): boolean {
  const pending = connectedPlayerIds(room).filter((playerId) => playerId !== describerId);
  return pending.length > 0 && pending.every((playerId) => collected.includes(playerId));
}

function withCollected(collected: readonly string[], playerId: string): string[] {
  return collected.includes(playerId) ? [...collected] : [...collected, playerId];
}

// --- ステージ遷移 ---

/** ゲームを終える。使用したアイテムセットのアイテムを結果へ添える（12の結果） */
function finishGame(publicState: BlindRoomPublic, gameSecret: BlindRoomGameSecret): Transition {
  const pack = resolvePack(publicState.packId);
  const usedSetIds = [...new Set(gameSecret.itemSetIds)];
  const items = usedSetIds.flatMap((setId) => paletteOf(itemSetOf(pack, setId)));

  return {
    publicState,
    stage: STAGES.reveal,
    result: {
      scores: [...publicState.scores].sort((a, b) => b.points - a.points),
      rounds: publicState.rounds.map((record) => ({ ...record })),
      items,
    },
  };
}

/** 次のラウンドの handoff へ進む。範囲を超えていればゲームを終える */
function toHandoff(
  room: Room,
  publicState: BlindRoomPublic,
  gameSecret: BlindRoomGameSecret,
  roundIndex: number,
): Transition {
  if (roundIndex >= publicState.totalRounds) {
    return finishGame(publicState, gameSecret);
  }

  const pack = resolvePack(publicState.packId);
  const itemSetId = gameSecret.itemSetIds[roundIndex] ?? "";
  const set = itemSetOf(pack, itemSetId);
  const cellCount = cellCountOf(publicState.boardSizeId);
  const sample = gameSecret.samples[roundIndex] ?? emptyBoard(cellCount);
  const describerId = publicState.describerOrder[roundIndex];

  const nextPublic: BlindRoomPublic = {
    ...publicState,
    roundIndex,
    itemSetId,
    palette: paletteOf(set),
    readyPlayerIds: [],
    donePlayerIds: [],
  };

  return {
    publicState: nextPublic,
    stage: STAGES.handoff,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.handoff,
    secrets: buildSecrets(room.players, set, sample, describerId, roundIndex, {}, cellCount),
    gameSecret: { ...gameSecret, boards: {} },
  };
}

/**
 * 説明者が未接続のラウンドを飛ばす。
 *
 * 見本を読む人がいないラウンドは、進めても全員が0点になるだけである。
 * 飛ばしたラウンドは記録せず、後から戻らない（12のonDeadline）。
 */
function skipRound(room: Room, publicState: BlindRoomPublic, gameSecret: BlindRoomGameSecret): Transition {
  let next = publicState.roundIndex + 1;
  while (next < publicState.totalRounds && !isConnected(room, publicState.describerOrder[next])) {
    next += 1;
  }
  return toHandoff(room, publicState, gameSecret, next);
}

/**
 * 配置を締めて答え合わせへ進む。得点はこの時点で確定し、以後は再計算しない。
 *
 * 盤面を1度も送っていない聞き手は空の盤面として採点する（12のonDeadline）。
 */
function toReveal(room: Room, publicState: BlindRoomPublic, gameSecret: BlindRoomGameSecret): Transition {
  const describerId = describerPlayerIdOf(publicState);
  const cellCount = cellCountOf(publicState.boardSizeId);
  const sample = gameSecret.samples[publicState.roundIndex] ?? emptyBoard(cellCount);

  const boards: BoardResult[] = room.players
    .filter((player) => player.id !== describerId)
    .map((player) => {
      const cells = gameSecret.boards[player.id] ?? emptyBoard(cellCount);
      return { playerId: player.id, cells: [...cells], matched: countMatches(sample, cells) };
    });

  let scores = publicState.scores;
  for (const board of boards) {
    if (board.matched > 0) {
      scores = addPoints(scores, board.playerId, board.matched);
    }
  }

  // 未接続の聞き手を平均から除く。落ちた端末の0点が説明者の得点を削らないようにする（12の得点）
  const connectedMatches = boards
    .filter((board) => isConnected(room, board.playerId))
    .map((board) => board.matched);
  const describerPoints = describerPointsOf(connectedMatches);
  if (describerId !== undefined && describerPoints > 0) {
    scores = addPoints(scores, describerId, describerPoints);
  }

  const record: RoundRecord = {
    roundIndex: publicState.roundIndex,
    describerId: describerId ?? "",
    itemSetId: publicState.itemSetId,
    sample: [...sample],
    boards,
    describerPoints,
  };

  const nextPublic: BlindRoomPublic = {
    ...publicState,
    scores,
    rounds: [...publicState.rounds, record],
    readyPlayerIds: [],
    donePlayerIds: [],
  };
  const nextSecret: BlindRoomGameSecret = { ...gameSecret, boards: {} };

  if (isFinalRound(publicState)) {
    return { ...finishGame(nextPublic, nextSecret), gameSecret: nextSecret };
  }

  return {
    publicState: nextPublic,
    stage: STAGES.reveal,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.reveal,
    gameSecret: nextSecret,
  };
}

// --- action ---

function handleReady(
  room: Room,
  publicState: BlindRoomPublic,
  gameSecret: BlindRoomGameSecret,
  playerId: string,
): Transition {
  const stage = room.stage;
  if ((stage !== STAGES.briefing && stage !== STAGES.reveal) || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  // 二重送信は拒否しない。結果に影響せず、再送で画面が止まる経路を作る方が害が大きい（08〜11と同じ扱い）
  const readyPlayerIds = withCollected(publicState.readyPlayerIds, playerId);
  const next: BlindRoomPublic = { ...publicState, readyPlayerIds };

  if (!allConnectedIn(room, readyPlayerIds)) {
    return { publicState: next };
  }

  const target = stage === STAGES.briefing ? 0 : publicState.roundIndex + 1;
  return toHandoff(room, next, gameSecret, target);
}

function handleStartRound(room: Room, publicState: BlindRoomPublic, playerId: string): Transition {
  if (room.stage !== STAGES.handoff || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (playerId !== describerPlayerIdOf(publicState)) {
    return { reject: { code: ERROR_CODES.notDescriber } };
  }
  return { stage: STAGES.building, deadlineSeconds: publicState.buildingSeconds };
}

function readCells(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  return (payload as { cells?: unknown }).cells;
}

function handlePlace(
  room: Room,
  publicState: BlindRoomPublic,
  gameSecret: BlindRoomGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.building || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (playerId === describerPlayerIdOf(publicState)) {
    return { reject: { code: ERROR_CODES.describerCannotPlace } };
  }

  const cells = readCells(payload);
  if (!isBoard(cells, cellCountOf(publicState.boardSizeId))) {
    return { reject: { code: ERROR_CODES.invalidBoard } };
  }
  const known = new Set(publicState.palette.map((item) => item.id));
  if (placedItemIds(cells).some((id) => !known.has(id))) {
    return { reject: { code: ERROR_CODES.unknownItem } };
  }
  if (placedCount(cells) > PLACE_COUNT) {
    return { reject: { code: ERROR_CODES.tooManyItems } };
  }
  if (hasDuplicateItem(cells)) {
    return { reject: { code: ERROR_CODES.duplicateItem } };
  }

  // 盤面を触った時点で完了申告を取り消す。done は完了の申告であって盤面の確定ではない（12のdone）
  const next: BlindRoomPublic = {
    ...publicState,
    donePlayerIds: publicState.donePlayerIds.filter((entry) => entry !== playerId),
  };

  return {
    publicState: next,
    gameSecret: { ...gameSecret, boards: { ...gameSecret.boards, [playerId]: [...cells] } },
    secrets: new Map([[playerId, listenerSecretOf(publicState.roundIndex, cells)]]),
  };
}

function readDone(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) {
    return true;
  }
  // 明示的な false だけを取り消しとして扱う。取り消しは押し間違いの救済であり、既定は申告である
  return (payload as { done?: unknown }).done !== false;
}

function handleDone(
  room: Room,
  publicState: BlindRoomPublic,
  gameSecret: BlindRoomGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.building || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  const describerId = describerPlayerIdOf(publicState);
  if (playerId === describerId) {
    return { reject: { code: ERROR_CODES.describerCannotPlace } };
  }

  const done = readDone(payload);
  const donePlayerIds = done
    ? withCollected(publicState.donePlayerIds, playerId)
    : publicState.donePlayerIds.filter((entry) => entry !== playerId);
  const next: BlindRoomPublic = { ...publicState, donePlayerIds };

  if (!done || !allListenersDone(room, donePlayerIds, describerId)) {
    return { publicState: next };
  }
  return toReveal(room, next, gameSecret);
}

// --- GameModule ---

export const blindRoomModule: GameModule<
  BlindRoomPublic,
  BlindRoomSecret,
  BlindRoomResult,
  BlindRoomGameSecret
> = {
  title: "BLIND ROOM",
  tagline: "見えない部屋の配置を英語で伝え、同じ形を作る",
  icon: "🧩",
  playerCount: [5, 6],
  contentLabelJa: "部屋を選ぶ",
  settingsFields: [
    {
      type: "select",
      key: "boardSizeId",
      labelJa: "盤面の広さ",
      options: BOARD_SIZE_IDS.map((id) => ({ value: id, labelJa: BOARD_SIZES[id].labelJa })),
      default: DEFAULT_BOARD_SIZE_ID,
    },
    {
      type: "number",
      key: "buildingSeconds",
      labelJa: "配置の秒数",
      min: BUILDING_SECONDS.min,
      max: BUILDING_SECONDS.max,
      step: BUILDING_SECONDS.step,
      default: BUILDING_SECONDS.default,
    },
  ],

  listContents: (): ContentSummary[] => PACKS.map(summarize),

  validateSettings,

  start: ({ players, contentId, settings, seed }) => {
    const random = createRandom(seed);
    const pack = resolvePack(contentId);

    // 全員が1回ずつ説明者を務める。順にレベルの重みを掛けない（12のstart）
    const describerOrder = shuffle(
      players.map((player: Player) => player.id),
      random,
    );

    // アイテムセットと見本を全ラウンド分ここで固定する。handleActionにシードが渡らない（基本設計/05）
    const { buildingSeconds, boardSizeId } = readSettings(settings);
    const cellCount = cellCountOf(boardSizeId);
    const itemSetIds = describerOrder.map((playerId) => pickItemSetId(pack, levelOf(players, playerId)));
    const samples = itemSetIds.map((setId) =>
      generateSample(
        (itemSetOf(pack, setId)?.items ?? []).map((item) => item.id),
        random,
        cellCount,
      ),
    );

    const firstSet = itemSetOf(pack, itemSetIds[0]);
    const publicState: BlindRoomPublic = {
      packId: pack.id,
      roundIndex: 0,
      totalRounds: describerOrder.length,
      describerOrder,
      itemSetId: itemSetIds[0] ?? "",
      boardSizeId,
      palette: paletteOf(firstSet),
      placeCount: PLACE_COUNT,
      readyPlayerIds: [],
      donePlayerIds: [],
      keyExpressions: pack.keyExpressions.map((entry) => ({ ...entry })),
      rounds: [],
      scores: players.map((player: Player) => ({ playerId: player.id, points: 0 })),
      buildingSeconds,
    };

    return {
      stage: STAGES.briefing,
      deadlineSeconds: STAGE_DEADLINE_SECONDS.briefing,
      publicState,
      secrets: buildSecrets(players, firstSet, samples[0] ?? emptyBoard(cellCount), describerOrder[0], 0, {}, cellCount),
      gameSecret: { itemSetIds, samples, boards: {} },
    };
  },

  handleAction: ({ room, publicState, gameSecret, playerId, action, payload }) => {
    if (gameSecret === undefined) {
      return { reject: { code: ERROR_CODES.invalidStage } };
    }
    switch (action) {
      case ACTIONS.ready:
        return handleReady(room, publicState, gameSecret, playerId);
      case ACTIONS.startRound:
        return handleStartRound(room, publicState, playerId);
      case ACTIONS.place:
        return handlePlace(room, publicState, gameSecret, playerId, payload);
      case ACTIONS.done:
        return handleDone(room, publicState, gameSecret, playerId, payload);
      default:
        return { reject: { code: ERROR_CODES.invalidStage } };
    }
  },

  onDeadline: ({ room, publicState, gameSecret }) => {
    if (gameSecret === undefined) {
      return {};
    }
    switch (room.stage) {
      case STAGES.briefing: {
        // 未readyを既読扱いにして1ラウンド目へ進む（12のonDeadline）
        const readyPlayerIds = [...new Set([...publicState.readyPlayerIds, ...connectedPlayerIds(room)])];
        return toHandoff(room, { ...publicState, readyPlayerIds }, gameSecret, 0);
      }
      case STAGES.handoff: {
        if (!isConnected(room, describerPlayerIdOf(publicState))) {
          return skipRound(room, publicState, gameSecret);
        }
        return { stage: STAGES.building, deadlineSeconds: publicState.buildingSeconds };
      }
      case STAGES.building:
        return toReveal(room, publicState, gameSecret);
      case STAGES.reveal:
        return toHandoff(room, publicState, gameSecret, publicState.roundIndex + 1);
      default:
        return {};
    }
  },

  validateContent,
};
