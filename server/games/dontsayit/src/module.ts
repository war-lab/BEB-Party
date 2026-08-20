// DON'T SAY ITのGameModule実装（基本設計/09_DONTSAYITゲームモジュール.md）。
//
// すべて純粋関数として書く。storage・WebSocket・現在時刻・Math.random()に触らない（基本設計/05）。
import type { ContentSummary, GameModule, GameTransition, Level, Player, Room, ValidationResult } from "@beb/shared-core";
import { createRandom, shuffle } from "@beb/shared-core";
import {
  ACTIONS,
  ERROR_CODES,
  MAX_CARD_ADVANCES_PER_ROUND,
  ROUND_SECONDS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  advancesOf,
  hasConstraint,
  roleOf,
  speakerPlayerIdOf,
  tabooCountFor,
  watcherPlayerIdOf,
  type Card,
  type ConstraintCard,
  type DontSayItPublic,
  type DontSayItResult,
  type DontSayItSecret,
  type DontSayItSettings,
  type RoundSummary,
  type ScoreEntry,
  type TabooSet,
} from "@beb/shared-dontsayit";
import { SETS, findSet, summarize } from "./sets";
import { validateContent } from "./validate-content";

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015）。
 *
 * 山札の順序と現在位置を公開状態に置けない。残りのカードが見えると回答者が正解を先に知る。
 * setIdと説明者順は公開状態にあるため、ここには持たない（09のゲーム秘密状態）。
 */
export interface DontSayItGameSecret {
  deck: string[];
  /** 次に配るカードのdeck内位置 */
  cursor: number;
  currentCardId: string | null;
  /** debriefで開示する対象 */
  usedCardIds: string[];
}

type Transition = GameTransition<DontSayItPublic, DontSayItResult, DontSayItGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): DontSayItSettings {
  if (typeof settings === "object" && settings !== null && "roundSeconds" in settings) {
    const value = (settings as { roundSeconds: unknown }).roundSeconds;
    if (typeof value === "number") {
      return { roundSeconds: value };
    }
  }
  return { roundSeconds: ROUND_SECONDS.default };
}

function validateSettings(settings: unknown): ValidationResult {
  if (settings === undefined || settings === null) {
    return { valid: true };
  }
  if (typeof settings !== "object") {
    return { valid: false, reason: "settingsはオブジェクトである必要がある" };
  }
  if (!("roundSeconds" in settings)) {
    return { valid: true };
  }
  const value = (settings as { roundSeconds: unknown }).roundSeconds;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { valid: false, reason: "roundSecondsは整数である必要がある" };
  }
  if (value < ROUND_SECONDS.min || value > ROUND_SECONDS.max) {
    return {
      valid: false,
      reason: `roundSecondsは${ROUND_SECONDS.min}以上${ROUND_SECONDS.max}以下である必要がある`,
    };
  }
  return { valid: true };
}

// --- セットの解決 ---

function resolveSet(setId: string): TabooSet {
  const target = findSet(setId);
  if (target === undefined) {
    // 共通コアがconfigureとstartでcontentIdを検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録のお題セットid: ${setId}`);
  }
  return target;
}

function findCard(target: TabooSet, cardId: string): Card | undefined {
  return target.cards.find((card) => card.id === cardId);
}

// --- 秘密情報の組み立て ---

function levelOf(players: readonly Player[], playerId: string): Level {
  return players.find((player) => player.id === playerId)?.level ?? 1;
}

/**
 * 説明者へ提示する禁止語。先頭から必要数だけ取る。
 *
 * 順序をシャッフルしないのは、どの語を落としても難度が同じとは限らないためである。
 * コンテンツ側が「正解に強く結びつく順」に並べる（09のレベル差の吸収）。
 */
function tabooFor(card: Card, level: Level): string[] {
  return card.taboo.slice(0, tabooCountFor(level));
}

/**
 * その時点の役に応じた秘密情報を全員分作る。
 *
 * 役が変わった参加者だけに送ると、前の役の内容が相手の手元に残る。
 * 共通コアは playerSecrets[playerId] を上書きし、差分をマージしない（09の秘密情報）。
 */
function buildSecrets(
  target: TabooSet,
  players: readonly Player[],
  publicState: DontSayItPublic,
  cardId: string | null,
): Map<string, DontSayItSecret> {
  const secrets = new Map<string, DontSayItSecret>();
  const card = cardId === null ? undefined : findCard(target, cardId);

  for (const player of players) {
    const role = roleOf(publicState, player.id);
    if (role === "speaker" && card !== undefined) {
      const level = levelOf(players, player.id);
      secrets.set(player.id, {
        role: "speaker",
        card: { cardId: card.id, answer: card.answer, taboo: tabooFor(card, level) },
      });
      continue;
    }
    if (role === "watcher" && card !== undefined) {
      // 説明者に提示したものと同じ集合を渡す。語数が違うと違反の判断がずれる（09）
      const speakerId = speakerPlayerIdOf(publicState);
      const speakerLevel = speakerId === undefined ? 1 : levelOf(players, speakerId);
      secrets.set(player.id, {
        role: "watcher",
        cardId: card.id,
        taboo: tabooFor(card, speakerLevel),
        answer: card.answer,
      });
      continue;
    }
    secrets.set(player.id, { role: "answerer" });
  }
  return secrets;
}

/**
 * そのラウンドの説明者に課される制約。レベル5でなければ課さない。
 *
 * どの制約を配るかは `roundIndex` で決め、ラウンドの途中では変えない。
 * 抽選にしないのは、`handleAction` にシードが渡らないためである（基本設計/05）。
 */
function constraintOf(
  target: TabooSet,
  players: readonly Player[],
  speakerId: string | undefined,
  roundIndex: number,
): ConstraintCard | null {
  if (speakerId === undefined || !hasConstraint(levelOf(players, speakerId))) {
    return null;
  }
  return target.constraints[roundIndex % Math.max(1, target.constraints.length)] ?? null;
}

// --- 山札 ---

/** 次のカードを引く。山札が尽きていれば undefined */
function draw(gameSecret: DontSayItGameSecret): { cardId: string; cursor: number } | undefined {
  const cardId = gameSecret.deck[gameSecret.cursor];
  if (cardId === undefined) {
    return undefined;
  }
  return { cardId, cursor: gameSecret.cursor + 1 };
}

/**
 * 表示中のカードを捨て札にして次を引く。
 *
 * `disclose` が偽のときは山札から落とすだけで `usedCardIds` へ積まない。
 * 一度も `explaining` に入っていないカードは誰も見ていないため、結果画面で開示してはならない（09）。
 */
function consumeCurrent(gameSecret: DontSayItGameSecret, disclose = true): DontSayItGameSecret {
  const used =
    gameSecret.currentCardId === null || !disclose
      ? gameSecret.usedCardIds
      : [...gameSecret.usedCardIds, gameSecret.currentCardId];
  const next = draw(gameSecret);
  return {
    ...gameSecret,
    usedCardIds: used,
    currentCardId: next?.cardId ?? null,
    cursor: next?.cursor ?? gameSecret.cursor,
  };
}

// --- 得点 ---

function addPoints(scores: readonly ScoreEntry[], playerId: string, delta: number): ScoreEntry[] {
  const exists = scores.some((entry) => entry.playerId === playerId);
  const updated = scores.map((entry) =>
    entry.playerId === playerId ? { ...entry, points: entry.points + delta } : entry,
  );
  return exists ? updated : [...updated, { playerId, points: delta }];
}

// --- 進行 ---

function connectedPlayerIds(room: Room): string[] {
  return room.players.filter((player) => player.connected).map((player) => player.id);
}

function isParticipant(room: Room, playerId: string): boolean {
  return room.players.some((player) => player.id === playerId);
}

function isConnected(room: Room, playerId: string | undefined): boolean {
  return room.players.some((player) => player.id === playerId && player.connected);
}

function allConnectedIn(room: Room, collected: string[]): boolean {
  const connected = connectedPlayerIds(room);
  return connected.length > 0 && connected.every((playerId) => collected.includes(playerId));
}

function summarizeRound(publicState: DontSayItPublic): RoundSummary {
  return {
    speakerPlayerId: speakerPlayerIdOf(publicState) ?? "",
    watcherPlayerId: watcherPlayerIdOf(publicState) ?? "",
    solved: publicState.solvedThisRound,
    violated: publicState.violatedThisRound,
    skipped: publicState.skipUsedThisRound,
  };
}

function buildResult(target: TabooSet, publicState: DontSayItPublic, gameSecret: DontSayItGameSecret): DontSayItResult {
  const usedCards = gameSecret.usedCardIds
    .map((cardId) => findCard(target, cardId))
    .filter((card): card is Card => card !== undefined)
    .map((card) => ({ answer: card.answer, taboo: [...card.taboo] }));

  return {
    scores: [...publicState.scores].sort((a, b) => b.points - a.points),
    rounds: [...publicState.rounds],
    usedCards,
    keyExpressions: target.keyExpressions.map((entry) => ({ ...entry })),
  };
}

/**
 * ラウンドを終えて次へ進む。最後のラウンドか山札が尽きた場合は結果を返す。
 *
 * 表示中のカードは捨て札にする。当てられなかったカードを次のラウンドへ持ち越すと、
 * 場が既に聞いた人物を次の説明者が説明することになる。
 */
function endRound(
  room: Room,
  publicState: DontSayItPublic,
  gameSecret: DontSayItGameSecret,
  disclose = true,
): Transition {
  const target = resolveSet(publicState.setId);
  const rounds = [...publicState.rounds, summarizeRound(publicState)];
  const nextSecret = consumeCurrent(gameSecret, disclose);
  const nextIndex = publicState.roundIndex + 1;
  const finished = nextIndex >= publicState.speakerOrder.length || nextSecret.currentCardId === null;

  if (finished) {
    // 進行中のカウンタも戻す。rounds と足し合わせて集計する画面が最終ラウンドを二重計上しないため
    const nextPublic: DontSayItPublic = {
      ...publicState,
      rounds,
      solvedThisRound: 0,
      violatedThisRound: 0,
      skipUsedThisRound: false,
    };
    return {
      publicState: nextPublic,
      gameSecret: nextSecret,
      stage: STAGES.debrief,
      result: buildResult(target, nextPublic, nextSecret),
    };
  }

  const nextPublic: DontSayItPublic = {
    ...publicState,
    rounds,
    roundIndex: nextIndex,
    constraint: constraintOf(target, room.players, publicState.speakerOrder[nextIndex], nextIndex),
    solvedThisRound: 0,
    violatedThisRound: 0,
    skipUsedThisRound: false,
  };
  return {
    publicState: nextPublic,
    gameSecret: nextSecret,
    stage: STAGES.handoff,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.handoff,
    secrets: buildSecrets(target, room.players, nextPublic, nextSecret.currentCardId),
  };
}

/** カード1枚を消費して次を配る。山札が尽きたらラウンドを終える */
function advanceCard(
  room: Room,
  publicState: DontSayItPublic,
  gameSecret: DontSayItGameSecret,
  nextPublic: DontSayItPublic,
): Transition {
  const target = resolveSet(publicState.setId);
  // 1ラウンドで送れる回数に達したらラウンドを終える。
  // 上限がないと1人の連打で山札が尽き、残りの参加者が説明者を務められない（09）
  if (advancesOf(nextPublic) >= MAX_CARD_ADVANCES_PER_ROUND) {
    return endRound(room, nextPublic, gameSecret);
  }
  const nextSecret = consumeCurrent(gameSecret);
  if (nextSecret.currentCardId === null) {
    // 山札が尽きた。このラウンドを終える（09のステージ）
    return endRound(room, nextPublic, gameSecret);
  }
  return {
    publicState: nextPublic,
    gameSecret: nextSecret,
    secrets: buildSecrets(target, room.players, nextPublic, nextSecret.currentCardId),
  };
}

// --- action ---

function handleReady(room: Room, publicState: DontSayItPublic, playerId: string): Transition {
  if (room.stage !== STAGES.briefing || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  // 二重送信は拒否しない。結果に影響せず、再送で画面が止まる経路を作る方が害が大きい（08と同じ扱い）
  const readyPlayerIds = publicState.readyPlayerIds.includes(playerId)
    ? publicState.readyPlayerIds
    : [...publicState.readyPlayerIds, playerId];
  const next: DontSayItPublic = { ...publicState, readyPlayerIds };

  if (!allConnectedIn(room, readyPlayerIds)) {
    return { publicState: next };
  }
  return { publicState: next, stage: STAGES.handoff, deadlineSeconds: STAGE_DEADLINE_SECONDS.handoff };
}

function handleStartRound(room: Room, publicState: DontSayItPublic, playerId: string): Transition {
  if (room.stage !== STAGES.handoff || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (speakerPlayerIdOf(publicState) !== playerId) {
    return { reject: { code: ERROR_CODES.notSpeaker } };
  }
  return { stage: STAGES.explaining, deadlineSeconds: publicState.roundSeconds };
}

function readCardId(payload: unknown): string | undefined {
  if (typeof payload === "object" && payload !== null && "cardId" in payload) {
    const value = (payload as { cardId: unknown }).cardId;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function handleClaimCorrect(
  room: Room,
  publicState: DontSayItPublic,
  gameSecret: DontSayItGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.explaining || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (speakerPlayerIdOf(publicState) !== playerId) {
    return { reject: { code: ERROR_CODES.notSpeaker } };
  }
  if (readCardId(payload) !== gameSecret.currentCardId) {
    return { reject: { code: ERROR_CODES.staleCard } };
  }

  const targetPlayerId =
    typeof payload === "object" && payload !== null && "playerId" in payload
      ? (payload as { playerId: unknown }).playerId
      : undefined;

  // 説明者自身と監視役は加点対象にできない。監視役は禁止語を見ている（09の3役）
  if (
    typeof targetPlayerId !== "string" ||
    !isParticipant(room, targetPlayerId) ||
    targetPlayerId === playerId ||
    targetPlayerId === watcherPlayerIdOf(publicState)
  ) {
    return { reject: { code: ERROR_CODES.invalidTarget } };
  }

  const scores = addPoints(addPoints(publicState.scores, playerId, 1), targetPlayerId, 1);
  const nextPublic: DontSayItPublic = {
    ...publicState,
    scores,
    solvedThisRound: publicState.solvedThisRound + 1,
  };
  return advanceCard(room, publicState, gameSecret, nextPublic);
}

function handleReportViolation(
  room: Room,
  publicState: DontSayItPublic,
  gameSecret: DontSayItGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.explaining || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (watcherPlayerIdOf(publicState) !== playerId) {
    return { reject: { code: ERROR_CODES.notWatcher } };
  }
  if (readCardId(payload) !== gameSecret.currentCardId) {
    return { reject: { code: ERROR_CODES.staleCard } };
  }

  const speakerId = speakerPlayerIdOf(publicState);
  const scores = speakerId === undefined ? publicState.scores : addPoints(publicState.scores, speakerId, -1);
  const nextPublic: DontSayItPublic = {
    ...publicState,
    scores,
    violatedThisRound: publicState.violatedThisRound + 1,
  };
  return advanceCard(room, publicState, gameSecret, nextPublic);
}

function handleSkipCard(
  room: Room,
  publicState: DontSayItPublic,
  gameSecret: DontSayItGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.explaining || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (speakerPlayerIdOf(publicState) !== playerId) {
    return { reject: { code: ERROR_CODES.notSpeaker } };
  }
  if (publicState.skipUsedThisRound) {
    return { reject: { code: ERROR_CODES.skipUsed } };
  }
  if (readCardId(payload) !== gameSecret.currentCardId) {
    return { reject: { code: ERROR_CODES.staleCard } };
  }

  const nextPublic: DontSayItPublic = { ...publicState, skipUsedThisRound: true };
  return advanceCard(room, publicState, gameSecret, nextPublic);
}

// --- GameModule ---

export const dontSayItModule: GameModule<
  DontSayItPublic,
  DontSayItSecret,
  DontSayItResult,
  DontSayItGameSecret
> = {
  title: "DON'T SAY IT",
  tagline: "禁止語を避けて、英語で人物を説明する",
  icon: "🤐",
  playerCount: [5, 6],
  contentLabelJa: "お題を選ぶ",
  settingsFields: [
    {
      type: "number",
      key: "roundSeconds",
      labelJa: "1ラウンドの秒数",
      min: ROUND_SECONDS.min,
      max: ROUND_SECONDS.max,
      step: 10,
      default: ROUND_SECONDS.default,
    },
  ],

  listContents: (): ContentSummary[] => SETS.map(summarize),

  validateSettings,

  start: ({ players, contentId, settings, seed }) => {
    const random = createRandom(seed);
    const target = resolveSet(contentId);

    const speakerOrder = shuffle(
      players.map((player: Player) => player.id),
      random,
    );
    const deck = shuffle(
      target.cards.map((card) => card.id),
      random,
    );
    const first = deck[0];

    const publicState: DontSayItPublic = {
      setId: target.id,
      speakerOrder,
      roundIndex: 0,
      readyPlayerIds: [],
      constraint: constraintOf(target, players, speakerOrder[0], 0),
      scores: players.map((player: Player) => ({ playerId: player.id, points: 0 })),
      rounds: [],
      solvedThisRound: 0,
      violatedThisRound: 0,
      skipUsedThisRound: false,
      roundSeconds: readSettings(settings).roundSeconds,
    };

    return {
      stage: STAGES.briefing,
      deadlineSeconds: STAGE_DEADLINE_SECONDS.briefing,
      publicState,
      secrets: buildSecrets(target, players, publicState, first ?? null),
      gameSecret: {
        deck,
        cursor: first === undefined ? 0 : 1,
        currentCardId: first ?? null,
        usedCardIds: [],
      },
    };
  },

  handleAction: ({ room, publicState, gameSecret, playerId, action, payload }) => {
    if (gameSecret === undefined) {
      return { reject: { code: ERROR_CODES.invalidStage } };
    }
    switch (action) {
      case ACTIONS.ready:
        return handleReady(room, publicState, playerId);
      case ACTIONS.startRound:
        return handleStartRound(room, publicState, playerId);
      case ACTIONS.claimCorrect:
        return handleClaimCorrect(room, publicState, gameSecret, playerId, payload);
      case ACTIONS.reportViolation:
        return handleReportViolation(room, publicState, gameSecret, playerId, payload);
      case ACTIONS.skipCard:
        return handleSkipCard(room, publicState, gameSecret, playerId, payload);
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
        // 未readyを既読扱いにして最初の交代へ進む（09）
        const readyPlayerIds = [...new Set([...publicState.readyPlayerIds, ...connectedPlayerIds(room)])];
        return {
          publicState: { ...publicState, readyPlayerIds },
          stage: STAGES.handoff,
          deadlineSeconds: STAGE_DEADLINE_SECONDS.handoff,
        };
      }
      case STAGES.handoff: {
        // 説明者が未接続ならそのラウンドを飛ばす。未接続を待って進行を止めない（09）
        if (!isConnected(room, speakerPlayerIdOf(publicState))) {
          // このラウンドのカードは誰も見ていない。捨て札にするが結果画面では開示しない
          return endRound(room, publicState, gameSecret, false);
        }
        return { stage: STAGES.explaining, deadlineSeconds: publicState.roundSeconds };
      }
      case STAGES.explaining:
        return endRound(room, publicState, gameSecret);
      default:
        // debriefには締切を置かない。ここへは到達しない
        return {};
    }
  },

  validateContent,
};
