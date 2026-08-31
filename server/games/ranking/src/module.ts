// ENGLISH RANKINGのGameModule実装（基本設計/10_ENGLISHRANKINGゲームモジュール.md）。
//
// handleAction と onDeadline は純粋関数として書く。storage・WebSocket・時刻取得・Math.random に触らない。
// 乱数は共通コアが注入する seed からのみ作る（基本設計/05の呼び出し規約）。
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
import {
  ACTIONS,
  DISCUSSION_SECONDS,
  ERROR_CODES,
  ITEMS_PER_SET,
  POINTS_PER_GOAL,
  ROUNDS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  achieves,
  hintCountFor,
  isFinalRound,
  type GoalCard,
  type RankingPack,
  type RankingPublic,
  type RankingResult,
  type RankingSecret,
  type RankingSet,
  type RankingSettings,
  type RevealedGoal,
  type RoundRecord,
  type ScoreEntry,
} from "@beb/shared-ranking";
import { PACKS, findPack, summarize } from "./packs";
import { validateContent } from "./validate-content";

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015）。
 *
 * 目標を公開状態に置けない。他人の目標が見えると議論が相手の目標を潰す作業になる。
 * 未使用セットのidも置けない。次のラウンドの項目が分かると議論中に先の目標を考えられる。
 */
export interface RankingGameSecret {
  /** 使うセットのid。開始時に抽選して固定する */
  setIds: string[];
  /**
   * ラウンドごとの playerId -> 目標カード。
   *
   * 全ラウンド分を start で決める。handleAction と onDeadline にはシードが渡らないため、
   * ラウンドが進むたびに抽選する形は取れない（基本設計/05の呼び出し規約）。
   */
  goalsByRound: Record<string, GoalCard>[];
}

type Transition = GameTransition<RankingPublic, RankingResult, RankingGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): RankingSettings {
  if (typeof settings === "object" && settings !== null && "discussionSeconds" in settings) {
    const value = (settings as { discussionSeconds: unknown }).discussionSeconds;
    if (typeof value === "number") {
      return { discussionSeconds: value };
    }
  }
  return { discussionSeconds: DISCUSSION_SECONDS.default };
}

function validateSettings(settings: unknown): ValidationResult {
  if (settings === undefined || settings === null) {
    return { valid: true };
  }
  if (typeof settings !== "object") {
    return { valid: false, reason: "settingsはオブジェクトである必要がある" };
  }
  if (!("discussionSeconds" in settings)) {
    return { valid: true };
  }
  const value = (settings as { discussionSeconds: unknown }).discussionSeconds;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { valid: false, reason: "discussionSecondsは整数である必要がある" };
  }
  if (value < DISCUSSION_SECONDS.min || value > DISCUSSION_SECONDS.max) {
    return {
      valid: false,
      reason: `discussionSecondsは${DISCUSSION_SECONDS.min}以上${DISCUSSION_SECONDS.max}以下である必要がある`,
    };
  }
  return { valid: true };
}

// --- パックとセットの解決 ---

function resolvePack(packId: string): RankingPack {
  const target = findPack(packId);
  if (target === undefined) {
    // 共通コアがconfigureとstartでcontentIdを検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録のお題パックid: ${packId}`);
  }
  return target;
}

function resolveSet(pack: RankingPack, setId: string): RankingSet | undefined {
  return pack.sets.find((entry) => entry.id === setId);
}

// --- 目標の割り当て ---

function levelOf(players: readonly Player[], playerId: string): Level {
  return players.find((player) => player.id === playerId)?.level ?? 1;
}

/**
 * 1ラウンド分の目標を配る。
 *
 * 参加者をレベルの昇順、カードを難度の昇順に並べて対応させる（10のレベル差の吸収）。
 * 絶対的な割り当てにしないのは、6枚のカードで参加者のレベル分布を選べないためである。
 *
 * 人数がカードより少ないときは、難度の高いカードから落とす。
 * 難度構成を 1,1,2,2,3,3 に固定しているため、5人なら難度3が1枚落ちる（10の検証6）。
 */
function assignGoals(set: RankingSet, players: readonly Player[], random: () => number): Record<string, GoalCard> {
  // 同じレベルの2人が毎回同じ難度にならないよう、先にシャッフルしてから安定ソートする
  const ordered = shuffle([...players], random).sort((a, b) => a.level - b.level);

  const cards = [...set.goals].sort((a, b) => a.difficulty - b.difficulty);
  while (cards.length > ordered.length) {
    // 最も難度の高い群からseedで1枚落とす
    const hardest = cards[cards.length - 1]?.difficulty;
    const candidates = cards.filter((card) => card.difficulty === hardest);
    const victim = candidates[Math.floor(random() * candidates.length)];
    const index = cards.findIndex((card) => card.id === victim?.id);
    cards.splice(index === -1 ? cards.length - 1 : index, 1);
  }

  const goals: Record<string, GoalCard> = {};
  for (const [index, player] of ordered.entries()) {
    const card = cards[index];
    if (card !== undefined) {
      goals[player.id] = card;
    }
  }
  return goals;
}

/**
 * そのラウンドの秘密情報を全員分作る。
 *
 * 共通コアは playerSecrets[playerId] を上書きし、差分をマージしない。
 * 全員分を作り直さないと、前のラウンドの目標が相手の手元に残る（10の秘密情報）。
 */
function buildSecrets(
  players: readonly Player[],
  goals: Record<string, GoalCard>,
  roundIndex: number,
): Map<string, RankingSecret> {
  const secrets = new Map<string, RankingSecret>();
  for (const player of players) {
    const card = goals[player.id];
    if (card === undefined) {
      continue;
    }
    secrets.set(player.id, {
      roundIndex,
      goal: {
        id: card.id,
        ja: card.ja,
        hintEn: card.hintEn.slice(0, hintCountFor(levelOf(players, player.id))),
      },
    });
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

function isHost(room: Room, playerId: string): boolean {
  return room.players.some((player) => player.id === playerId && player.isHost);
}

function allConnectedIn(room: Room, collected: readonly string[]): boolean {
  const connected = connectedPlayerIds(room);
  return connected.length > 0 && connected.every((playerId) => collected.includes(playerId));
}

function withCollected(collected: readonly string[], playerId: string): string[] {
  return collected.includes(playerId) ? [...collected] : [...collected, playerId];
}

// --- ラウンドの確定 ---

/**
 * 提案（または既定の順位）で1ラウンドを確定させ、開示へ進む。
 *
 * 得点はこの時点で確定し、以後は再計算しない。
 * コンテンツを差し替えても過去のラウンドの記録が動かないようにする（10の判定の規則）。
 */
function confirmRound(
  room: Room,
  publicState: RankingPublic,
  gameSecret: RankingGameSecret,
  ranking: string[],
): Transition {
  const goals = gameSecret.goalsByRound[publicState.roundIndex] ?? {};

  const revealed: RevealedGoal[] = [];
  let scores = publicState.scores;
  for (const player of room.players) {
    const card = goals[player.id];
    if (card === undefined) {
      continue;
    }
    const achieved = achieves(card.goal, ranking);
    revealed.push({ playerId: player.id, ja: card.ja, achieved });
    if (achieved) {
      scores = addPoints(scores, player.id, POINTS_PER_GOAL);
    }
  }

  const record: RoundRecord = {
    setId: gameSecret.setIds[publicState.roundIndex] ?? "",
    question: publicState.question,
    items: publicState.items.map((item) => ({ ...item })),
    ranking: [...ranking],
    goals: revealed,
  };

  const nextPublic: RankingPublic = {
    ...publicState,
    scores,
    rounds: [...publicState.rounds, record],
    proposedRanking: [...ranking],
    approvedPlayerIds: [],
    readyPlayerIds: [],
  };

  if (isFinalRound(publicState)) {
    return {
      publicState: nextPublic,
      stage: STAGES.reveal,
      result: {
        scores: [...nextPublic.scores].sort((a, b) => b.points - a.points),
        rounds: [...nextPublic.rounds],
      },
    };
  }

  return { publicState: nextPublic, stage: STAGES.reveal, deadlineSeconds: STAGE_DEADLINE_SECONDS.reveal };
}

/** 開示を終えて次のラウンドの briefing へ進む */
function startNextRound(room: Room, publicState: RankingPublic, gameSecret: RankingGameSecret): Transition {
  const nextIndex = publicState.roundIndex + 1;
  const pack = resolvePack(publicState.packId);
  const setId = gameSecret.setIds[nextIndex];
  const set = setId === undefined ? undefined : resolveSet(pack, setId);
  if (set === undefined) {
    // setIds は totalRounds と同じ長さで作るため到達しない。到達した場合は開示に留める
    return {};
  }

  const nextPublic: RankingPublic = {
    ...publicState,
    roundIndex: nextIndex,
    question: { ...set.question },
    items: set.items.map((item) => ({ ...item })),
    keyExpressions: set.keyExpressions.map((entry) => ({ ...entry })),
    readyPlayerIds: [],
    proposedRanking: null,
    approvedPlayerIds: [],
  };

  return {
    publicState: nextPublic,
    stage: STAGES.briefing,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.briefing,
    secrets: buildSecrets(room.players, gameSecret.goalsByRound[nextIndex] ?? {}, nextIndex),
  };
}

// --- action ---

function handleReady(room: Room, publicState: RankingPublic, gameSecret: RankingGameSecret, playerId: string): Transition {
  const stage = room.stage;
  if ((stage !== STAGES.briefing && stage !== STAGES.reveal) || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  // 二重送信は拒否しない。結果に影響せず、再送で画面が止まる経路を作る方が害が大きい（08・09と同じ扱い）
  const readyPlayerIds = withCollected(publicState.readyPlayerIds, playerId);
  const next: RankingPublic = { ...publicState, readyPlayerIds };

  if (!allConnectedIn(room, readyPlayerIds)) {
    return { publicState: next };
  }

  if (stage === STAGES.briefing) {
    return { publicState: next, stage: STAGES.discussion, deadlineSeconds: publicState.discussionSeconds };
  }
  return startNextRound(room, next, gameSecret);
}

/**
 * payloadから順位の並びを読む。
 *
 * `in` 演算子を使わずプロパティ参照で読む。ペイロードのキー名がこのゲームのgameIdと同綴りであり、
 * `"ranking" in payload` と書くとgameIdリテラルの検査（eslintの検査3）に当たる。
 */
function readRanking(payload: unknown): string[] | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const value = (payload as { ranking?: unknown }).ranking;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return undefined;
  }
  return value as string[];
}

function handleProposeRanking(
  room: Room,
  publicState: RankingPublic,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.confirming || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (!isHost(room, playerId)) {
    return { reject: { code: ERROR_CODES.notHost } };
  }

  const ranking = readRanking(payload);
  if (ranking === undefined || ranking.length !== ITEMS_PER_SET) {
    return { reject: { code: ERROR_CODES.invalidRanking } };
  }
  const itemIds = new Set(publicState.items.map((item) => item.id));
  if (new Set(ranking).size !== ranking.length || ranking.some((itemId) => !itemIds.has(itemId))) {
    return { reject: { code: ERROR_CODES.invalidRanking } };
  }

  // 提案を差し替えたら承認をすべて取り消す。承認した順位と確定する順位が違う状態を作らない（10）
  return { publicState: { ...publicState, proposedRanking: ranking, approvedPlayerIds: [] } };
}

function handleApproveRanking(
  room: Room,
  publicState: RankingPublic,
  gameSecret: RankingGameSecret,
  playerId: string,
): Transition {
  if (room.stage !== STAGES.confirming || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  const proposed = publicState.proposedRanking;
  if (proposed === null) {
    return { reject: { code: ERROR_CODES.noProposal } };
  }

  const approvedPlayerIds = withCollected(publicState.approvedPlayerIds, playerId);
  const next: RankingPublic = { ...publicState, approvedPlayerIds };

  if (!allConnectedIn(room, approvedPlayerIds)) {
    return { publicState: next };
  }
  return confirmRound(room, next, gameSecret, proposed);
}

// --- GameModule ---

export const rankingModule: GameModule<RankingPublic, RankingSecret, RankingResult, RankingGameSecret> = {
  title: "ENGLISH RANKING",
  tagline: "秘密の目標を抱えて、英語で順位を決める",
  icon: "🏆",
  playerCount: [5, 6],
  contentLabelJa: "お題を選ぶ",
  settingsFields: [
    {
      type: "number",
      key: "discussionSeconds",
      labelJa: "議論の秒数",
      min: DISCUSSION_SECONDS.min,
      max: DISCUSSION_SECONDS.max,
      step: DISCUSSION_SECONDS.step,
      default: DISCUSSION_SECONDS.default,
    },
  ],

  listContents: (): ContentSummary[] => PACKS.map(summarize),

  validateSettings,

  start: ({ players, contentId, settings, seed }) => {
    const random = createRandom(seed);
    const pack = resolvePack(contentId);

    // 使うセットを先に固定する。ラウンドごとに抽選すると同じセットを引く経路が残る（10）
    const setIds = shuffle(
      pack.sets.map((set) => set.id),
      random,
    ).slice(0, ROUNDS);

    // 目標も全ラウンド分をここで決める。handleActionにはシードが渡らない
    const goalsByRound = setIds.map((setId) => {
      const set = resolveSet(pack, setId);
      return set === undefined ? {} : assignGoals(set, players, random);
    });

    const first = resolveSet(pack, setIds[0] ?? "");
    const publicState: RankingPublic = {
      packId: pack.id,
      roundIndex: 0,
      totalRounds: setIds.length,
      question: first === undefined ? { en: "", ja: "" } : { ...first.question },
      items: first === undefined ? [] : first.items.map((item) => ({ ...item })),
      keyExpressions: first === undefined ? [] : first.keyExpressions.map((entry) => ({ ...entry })),
      readyPlayerIds: [],
      proposedRanking: null,
      approvedPlayerIds: [],
      scores: players.map((player: Player) => ({ playerId: player.id, points: 0 })),
      rounds: [],
      discussionSeconds: readSettings(settings).discussionSeconds,
    };

    return {
      stage: STAGES.briefing,
      deadlineSeconds: STAGE_DEADLINE_SECONDS.briefing,
      publicState,
      secrets: buildSecrets(players, goalsByRound[0] ?? {}, 0),
      gameSecret: { setIds, goalsByRound },
    };
  },

  handleAction: ({ room, publicState, gameSecret, playerId, action, payload }) => {
    if (gameSecret === undefined) {
      return { reject: { code: ERROR_CODES.invalidStage } };
    }
    switch (action) {
      case ACTIONS.ready:
        return handleReady(room, publicState, gameSecret, playerId);
      case ACTIONS.proposeRanking:
        return handleProposeRanking(room, publicState, playerId, payload);
      case ACTIONS.approveRanking:
        return handleApproveRanking(room, publicState, gameSecret, playerId);
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
        // 未readyを既読扱いにして議論へ進む（10のonDeadline）
        const readyPlayerIds = [...new Set([...publicState.readyPlayerIds, ...connectedPlayerIds(room)])];
        return {
          publicState: { ...publicState, readyPlayerIds },
          stage: STAGES.discussion,
          deadlineSeconds: publicState.discussionSeconds,
        };
      }
      case STAGES.discussion:
        return { stage: STAGES.confirming, deadlineSeconds: STAGE_DEADLINE_SECONDS.confirming };
      case STAGES.confirming: {
        // 提案が無ければ項目の定義順で確定する。進行を止めないための異常系の扱い（10）
        const ranking = publicState.proposedRanking ?? publicState.items.map((item) => item.id);
        return confirmRound(room, publicState, gameSecret, ranking);
      }
      case STAGES.reveal:
        return startNextRound(room, publicState, gameSecret);
      default:
        return {};
    }
  },

  validateContent,
};
