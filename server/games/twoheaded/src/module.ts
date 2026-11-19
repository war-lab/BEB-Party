// TWO-HEADED SPEAKERのGameModule実装（基本設計/16_TWOHEADEDゲームモジュール.md）。
//
// すべて純粋関数として書く。storage・WebSocket・現在時刻・Math.random()に触らない（基本設計/05）。
//
// アプリが観測できるのは画面の操作だけである。1語ずつ交互に話したか、答えが合っているか、
// どのペアが最初に当てたかは判定せず、説明役のペアの申告をそのまま正とする（不変条件1、16の進行の要点）。
import {
  createRandom,
  formBalancedTeams,
  isLapsId,
  LAPS_IDS,
  LAPS_OPTIONS,
  shuffle,
  type ContentSummary,
  type GameModule,
  type GameTransition,
  type Player,
  type Room,
  type ValidationResult,
} from "@beb/shared-core";
import {
  ACTIONS,
  DEFAULT_LAPS_ID,
  ERROR_CODES,
  MAX_CARDS_PER_TURN,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  TEAM_SIZES,
  TURN_SECONDS,
  advancesOf,
  explainerTeamIdOf,
  isExplainer,
  lapsOf,
  speakingOrderOf,
  teamOf,
  type Card,
  type CardOutcome,
  type TeamPublic,
  type TeamScore,
  type TwoHeadedPublic,
  type TwoHeadedResult,
  type TwoHeadedSecret,
  type TwoHeadedSet,
  type TwoHeadedSettings,
} from "@beb/shared-twoheaded";
import { SETS, findSet, summarize } from "./sets";
import { validateContent } from "./validate-content";

/** 結果で開示する1枚。cardId で引き、文言は結果を作るときにセットから写す */
export interface UsedCard {
  cardId: string;
  /** 説明したペア */
  teamId: string;
  outcome: CardOutcome | "timeout";
  guessedTeamId: string | null;
}

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015、16のゲーム秘密状態）。
 *
 * 山札の順序と現在位置を公開状態に置けない。残りのお題が見えると当てる側が答えを先に知る。
 */
export interface TwoHeadedGameSecret {
  /** シャッフル済みの cardId 列 */
  deck: string[];
  /** 次に配るお題の deck 内位置 */
  cursor: number;
  currentCardId: string | null;
  /**
   * teamId -> そのペアが説明したお題の通し番号の次の値。話す順のずらしに使う（16の「話す順の決め方」）。
   * 秘密ではないが、公開状態に置くと speakingOrder と二重管理になる
   */
  cardsExplained: Record<string, number>;
  /** debrief で開示する対象 */
  usedCards: UsedCard[];
}

type Transition = GameTransition<TwoHeadedPublic, TwoHeadedResult, TwoHeadedGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): TwoHeadedSettings {
  const source = typeof settings === "object" && settings !== null ? (settings as Record<string, unknown>) : {};
  const seconds = source.turnSeconds;
  return {
    turnSeconds: typeof seconds === "number" ? seconds : TURN_SECONDS.default,
    laps: lapsOf(source.laps),
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
  if ("laps" in source && !isLapsId(source.laps)) {
    return { valid: false, reason: `lapsは${LAPS_IDS.join(" / ")}のいずれかである必要がある` };
  }
  if (!("turnSeconds" in source)) {
    return { valid: true };
  }
  const value = source.turnSeconds;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { valid: false, reason: "turnSecondsは整数である必要がある" };
  }
  if (value < TURN_SECONDS.min || value > TURN_SECONDS.max) {
    return { valid: false, reason: `turnSecondsは${TURN_SECONDS.min}以上${TURN_SECONDS.max}以下である必要がある` };
  }
  return { valid: true };
}

// --- セットの解決 ---

function resolveSet(setId: string): TwoHeadedSet {
  const target = findSet(setId);
  if (target === undefined) {
    // 共通コアが configure と start で contentId を検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録のお題セットid: ${setId}`);
  }
  return target;
}

function findCard(target: TwoHeadedSet, cardId: string): Card | undefined {
  return target.cards.find((card) => card.id === cardId);
}

// --- 参加者 ---

function isParticipant(room: Room, playerId: string): boolean {
  return room.players.some((player) => player.id === playerId);
}

function connectedPlayerIds(room: Room): string[] {
  return room.players.filter((player) => player.connected).map((player) => player.id);
}

function allConnectedIn(room: Room, collected: readonly string[]): boolean {
  const connected = connectedPlayerIds(room);
  return connected.length > 0 && connected.every((playerId) => collected.includes(playerId));
}

function explainerTeamOf(publicState: TwoHeadedPublic): TeamPublic | undefined {
  return teamOf(publicState.teams, explainerTeamIdOf(publicState));
}

// --- 秘密情報の組み立て ---

/**
 * 1人分の秘密情報。説明役のペアにはいまのお題を、他は当てる側として中身の無い値を返す（16の秘密情報）。
 *
 * cardId が null のとき（briefing）は全員が当てる側になる。
 */
function secretFor(
  target: TwoHeadedSet,
  publicState: TwoHeadedPublic,
  cardId: string | null,
  playerId: string,
): TwoHeadedSecret {
  if (cardId === null || !isExplainer(publicState, playerId)) {
    return { role: "guesser" };
  }
  const card = findCard(target, cardId);
  if (card === undefined) {
    throw new Error(`お題セット${target.id}にカード${cardId}が無い`);
  }
  return {
    role: "explainer",
    card: { cardId: card.id, answer: card.answer, ja: card.ja, aliases: [...(card.aliases ?? [])] },
  };
}

/**
 * 指定した参加者へ送る秘密情報。
 *
 * 役が変わるときは全員へ送り直す。共通コアは playerSecrets[playerId] を上書きし、差分をマージしない（16の「送るときと値」）。
 */
function secretsFor(
  target: TwoHeadedSet,
  publicState: TwoHeadedPublic,
  cardId: string | null,
  playerIds: readonly string[],
): Map<string, TwoHeadedSecret> {
  return new Map(playerIds.map((playerId) => [playerId, secretFor(target, publicState, cardId, playerId)]));
}

// --- 得点 ---

function addPoint(scores: readonly TeamScore[], teamIds: readonly string[]): TeamScore[] {
  return scores.map((score) => (teamIds.includes(score.teamId) ? { ...score, points: score.points + 1 } : score));
}

// --- 進行 ---

function buildResult(target: TwoHeadedSet, publicState: TwoHeadedPublic, gameSecret: TwoHeadedGameSecret): TwoHeadedResult {
  const usedCards = gameSecret.usedCards.flatMap((used) => {
    const card = findCard(target, used.cardId);
    return card === undefined
      ? []
      : [{ answer: card.answer, ja: card.ja, teamId: used.teamId, outcome: used.outcome, guessedTeamId: used.guessedTeamId }];
  });
  return {
    teams: publicState.teams.map((team) => ({ teamId: team.teamId, members: [...team.members] })),
    // 同点の並びは teams の順を保つ（Array.prototype.sort は安定）
    scores: [...publicState.scores].sort((a, b) => b.points - a.points),
    turns: [...publicState.turns],
    usedCards,
    keyExpressions: target.keyExpressions.map((entry) => ({ ...entry })),
  };
}

/** 結果へ進む。debrief では話す順を出さない */
function finish(publicState: TwoHeadedPublic, gameSecret: TwoHeadedGameSecret): Transition {
  const target = resolveSet(publicState.setId);
  const nextPublic: TwoHeadedPublic = { ...publicState, speakingOrder: [] };
  return {
    publicState: nextPublic,
    gameSecret,
    stage: STAGES.debrief,
    result: buildResult(target, nextPublic, gameSecret),
  };
}

/**
 * turnIndex の手番を始める。1枚目のお題を引いて handoff へ進み、全員へ秘密を送り直す。
 *
 * 1枚目を start ではなくここで送るのは、start で送ると最初の説明役のペアだけが briefing の間にお題を読めるためである。
 * 山札が尽きていれば、残りの手番があっても結果へ進む（16のステージ）。
 */
function beginTurn(room: Room, publicState: TwoHeadedPublic, gameSecret: TwoHeadedGameSecret, turnIndex: number): Transition {
  const target = resolveSet(publicState.setId);
  const cardId = gameSecret.deck[gameSecret.cursor];
  if (cardId === undefined) {
    return finish(publicState, { ...gameSecret, currentCardId: null });
  }
  const teamId = publicState.turnOrder[turnIndex] ?? "";
  const team = teamOf(publicState.teams, teamId);
  const nextPublic: TwoHeadedPublic = {
    ...publicState,
    turnIndex,
    speakingOrder: speakingOrderOf(team?.members ?? [], gameSecret.cardsExplained[teamId] ?? 0),
    solvedThisTurn: 0,
    passedThisTurn: 0,
    lastCard: null,
  };
  const nextSecret: TwoHeadedGameSecret = { ...gameSecret, cursor: gameSecret.cursor + 1, currentCardId: cardId };
  return {
    publicState: nextPublic,
    gameSecret: nextSecret,
    stage: STAGES.handoff,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.handoff,
    secrets: secretsFor(
      target,
      nextPublic,
      cardId,
      room.players.map((player) => player.id),
    ),
  };
}

/**
 * 手番を終えて次の手番の handoff へ進む。最後の手番なら結果へ進む。
 *
 * - timeout: explaining の締切。表示中のお題を timeout として記録する。説明は済んでいるため通し番号も進める
 * - skipped: handoff で説明役のペアが2人そろわなかった。表示中のお題は誰も説明していないため、記録せずに山札から落とす
 * - completed: 消費上限か山札切れ。表示中のお題は既に正解か送りで記録済みである
 *
 * 締切で終えたお題を次の手番へ持ち越さない。場がすでに聞いた説明のお題を次のペアが説明することになる（16のステージの終わりの処理）。
 */
function endTurn(
  room: Room,
  publicState: TwoHeadedPublic,
  gameSecret: TwoHeadedGameSecret,
  reason: "timeout" | "skipped" | "completed",
): Transition {
  const teamId = explainerTeamIdOf(publicState) ?? "";
  let nextSecret: TwoHeadedGameSecret = { ...gameSecret, currentCardId: null };
  if (reason === "timeout" && gameSecret.currentCardId !== null) {
    nextSecret = {
      ...nextSecret,
      usedCards: [
        ...gameSecret.usedCards,
        { cardId: gameSecret.currentCardId, teamId, outcome: "timeout", guessedTeamId: null },
      ],
      cardsExplained: { ...gameSecret.cardsExplained, [teamId]: (gameSecret.cardsExplained[teamId] ?? 0) + 1 },
    };
  }
  // 3つのカウンタ（正解・送り・直前のお題）を戻す。turns と足し合わせて集計する画面が最後の手番を二重に数えないため
  const nextPublic: TwoHeadedPublic = {
    ...publicState,
    turns: [
      ...publicState.turns,
      { teamId, solved: publicState.solvedThisTurn, passed: publicState.passedThisTurn, skipped: reason === "skipped" },
    ],
    solvedThisTurn: 0,
    passedThisTurn: 0,
    lastCard: null,
  };
  const nextIndex = publicState.turnIndex + 1;
  if (nextIndex >= publicState.turnOrder.length) {
    return finish(nextPublic, nextSecret);
  }
  return beginTurn(room, nextPublic, nextSecret, nextIndex);
}

/**
 * 表示中のお題を正解か送りで終え、次のお題を配る（16の claimCorrect の3〜5）。
 *
 * 消費上限に達したか山札が尽きたら、その手番を終える。次のお題は説明役のペアにだけ送る。
 * 当てる側は handoff で受け取った中身の無い秘密のままでよい。
 */
function closeCard(
  room: Room,
  publicState: TwoHeadedPublic,
  gameSecret: TwoHeadedGameSecret,
  outcome: CardOutcome,
  guessedTeamId: string | null,
  scores: TeamScore[],
): Transition {
  const target = resolveSet(publicState.setId);
  const team = explainerTeamOf(publicState);
  const teamId = team?.teamId ?? "";
  const cardId = gameSecret.currentCardId ?? "";
  const card = findCard(target, cardId);
  const explained = (gameSecret.cardsExplained[teamId] ?? 0) + 1;

  const nextPublic: TwoHeadedPublic = {
    ...publicState,
    scores,
    solvedThisTurn: publicState.solvedThisTurn + (outcome === "solved" ? 1 : 0),
    passedThisTurn: publicState.passedThisTurn + (outcome === "passed" ? 1 : 0),
    // 言えない語の違反に当てる側が気付けるよう、終えたお題を全員の画面に出す（16の「言えない語」）
    lastCard: card === undefined ? null : { answer: card.answer, ja: card.ja, outcome, guessedTeamId },
  };
  const consumed: TwoHeadedGameSecret = {
    ...gameSecret,
    currentCardId: null,
    usedCards: [...gameSecret.usedCards, { cardId, teamId, outcome, guessedTeamId }],
    cardsExplained: { ...gameSecret.cardsExplained, [teamId]: explained },
  };

  // 上限がないと、送りの連打で山札を掘り尽くし、残りのペアが説明役を務められない（16のステージ）
  if (advancesOf(nextPublic) >= MAX_CARDS_PER_TURN) {
    return endTurn(room, nextPublic, consumed, "completed");
  }
  const nextCardId = consumed.deck[consumed.cursor];
  if (nextCardId === undefined) {
    return endTurn(room, nextPublic, consumed, "completed");
  }
  const withSpeakingOrder: TwoHeadedPublic = {
    ...nextPublic,
    speakingOrder: speakingOrderOf(team?.members ?? [], explained),
  };
  return {
    publicState: withSpeakingOrder,
    gameSecret: { ...consumed, cursor: consumed.cursor + 1, currentCardId: nextCardId },
    secrets: secretsFor(target, withSpeakingOrder, nextCardId, team?.members ?? []),
  };
}

// --- action ---

function readString(payload: unknown, key: string): string | undefined {
  if (typeof payload === "object" && payload !== null && key in payload) {
    const value = (payload as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function handleReady(room: Room, publicState: TwoHeadedPublic, gameSecret: TwoHeadedGameSecret, playerId: string): Transition {
  if (room.stage !== STAGES.briefing || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  // 二重送信は拒否しない。結果に影響せず、再送で画面が止まる経路を作る方が害が大きい（収録の各ゲームと同じ扱い）
  const readyPlayerIds = publicState.readyPlayerIds.includes(playerId)
    ? publicState.readyPlayerIds
    : [...publicState.readyPlayerIds, playerId];
  const next: TwoHeadedPublic = { ...publicState, readyPlayerIds };
  if (!allConnectedIn(room, readyPlayerIds)) {
    return { publicState: next };
  }
  return beginTurn(room, next, gameSecret, 0);
}

function handleStartTurn(room: Room, publicState: TwoHeadedPublic, playerId: string): Transition {
  if (room.stage !== STAGES.handoff || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (!isExplainer(publicState, playerId)) {
    return { reject: { code: ERROR_CODES.notExplainer } };
  }
  // ペアのどちらが送ってもよい。後から届いた1件はステージ違いで invalid_stage になる（16の startTurn）
  return { stage: STAGES.explaining, deadlineSeconds: publicState.turnSeconds };
}

function handleClaimCorrect(
  room: Room,
  publicState: TwoHeadedPublic,
  gameSecret: TwoHeadedGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.explaining || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (!isExplainer(publicState, playerId)) {
    return { reject: { code: ERROR_CODES.notExplainer } };
  }
  const explainerTeamId = explainerTeamIdOf(publicState);
  const guessedTeamId = readString(payload, "teamId");
  if (guessedTeamId === undefined || guessedTeamId === explainerTeamId || teamOf(publicState.teams, guessedTeamId) === undefined) {
    return { reject: { code: ERROR_CODES.invalidTarget } };
  }
  // ほぼ同時の2件目は cardId が古くなるため、同じお題に二重に加点されない（16の claimCorrect）
  if (gameSecret.currentCardId === null || readString(payload, "cardId") !== gameSecret.currentCardId) {
    return { reject: { code: ERROR_CODES.staleCard } };
  }
  const scores = addPoint(publicState.scores, [explainerTeamId ?? "", guessedTeamId]);
  return closeCard(room, publicState, gameSecret, "solved", guessedTeamId, scores);
}

function handlePassCard(
  room: Room,
  publicState: TwoHeadedPublic,
  gameSecret: TwoHeadedGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.explaining || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (!isExplainer(publicState, playerId)) {
    return { reject: { code: ERROR_CODES.notExplainer } };
  }
  if (gameSecret.currentCardId === null || readString(payload, "cardId") !== gameSecret.currentCardId) {
    return { reject: { code: ERROR_CODES.staleCard } };
  }
  // 送りは得点を動かさない。回数は手番ごとに制限せず、消費上限に含める（16の passCard）
  return closeCard(room, publicState, gameSecret, "passed", null, publicState.scores);
}

// --- 再接続 ---

/**
 * 再接続したプレイヤーへ送る秘密情報を作り直す（ADR-0029、16の「再接続での作り直し」）。
 *
 * 遷移で最後に送った秘密と同じ値を返す。finished では送らない。終局の時点で次のお題を引いている場合があり、
 * 同じ式で作り直すと誰も見ていないお題が届く。debrief の画面は秘密情報を読まない。
 *
 * お題セットが無い、表示中のお題がセットに無い、playing の間に gameSecret が無い場合は例外を投げる。
 * 共通コアは例外のときに保存済みの値を送るため、誤った値を返すより安全である。
 */
function rebuildSecret({
  room,
  publicState,
  gameSecret,
  playerId,
}: {
  room: Room;
  publicState: TwoHeadedPublic;
  gameSecret: TwoHeadedGameSecret | undefined;
  playerId: string;
}): TwoHeadedSecret | undefined {
  if (room.lifecycle !== "playing") {
    return undefined;
  }
  if (gameSecret === undefined) {
    throw new Error("playing中にgameSecretが無い");
  }
  if (!isParticipant(room, playerId)) {
    throw new Error(`参加者でない playerId: ${playerId}`);
  }
  const target = resolveSet(publicState.setId);
  switch (room.stage) {
    case STAGES.briefing:
      return { role: "guesser" };
    case STAGES.handoff:
    case STAGES.explaining:
      if (gameSecret.currentCardId === null) {
        throw new Error(`${room.stage} で表示中のお題が無い`);
      }
      return secretFor(target, publicState, gameSecret.currentCardId, playerId);
    case STAGES.debrief:
      return undefined;
    default:
      throw new Error(`未知のステージ: ${room.stage}`);
  }
}

// --- GameModule ---

export const twoHeadedModule: GameModule<TwoHeadedPublic, TwoHeadedSecret, TwoHeadedResult, TwoHeadedGameSecret> = {
  title: "TWO-HEADED SPEAKER",
  tagline: "ペアで1語ずつ交互に話し、お題を英語で説明する",
  // 2人の人影の絵文字。収録のゲームのアイコンと重ならない（16のロビーの記述子）
  icon: "\u{1F465}",
  // 3組以上でないと得点の付け方が競争として成り立たない（16の「対応人数の下限を6人にする理由」）。
  // 上限を変えるときは TEAM_SIZES と山札の下限（MIN_CARDS）を合わせる
  playerCount: [6, 8],
  tags: ["team"],
  contentLabelJa: "お題セットを選ぶ",
  settingsFields: [
    {
      type: "select",
      key: "laps",
      labelJa: "周回数",
      options: LAPS_IDS.map((id) => ({ value: id, labelJa: LAPS_OPTIONS[id].labelJa })),
      default: DEFAULT_LAPS_ID,
    },
    {
      type: "number",
      key: "turnSeconds",
      labelJa: "1手番の説明時間（秒）",
      min: TURN_SECONDS.min,
      max: TURN_SECONDS.max,
      step: TURN_SECONDS.step,
      default: TURN_SECONDS.default,
    },
  ],

  listContents: (): ContentSummary[] => SETS.map(summarize),

  validateSettings,

  // 裏画面で主催者が指定した組を、必ず同じペアに入れる（16の「ペアの編成と奇数人数」、ADR-0035）
  acceptsPinnedPairs: true,

  start: ({ players, contentId, settings, seed, pinnedPairs }) => {
    const target = resolveSet(contentId);
    const { turnSeconds, laps } = readSettings(settings);
    const random = createRandom(seed);

    const sizes = TEAM_SIZES[players.length];
    if (sizes === undefined) {
      // 共通コアが playerCount で人数を検証するため到達しない
      throw new Error(`対応していない人数: ${players.length}`);
    }
    // 先に並びを入れ替える。formBalancedTeams は各ペアの中の並びを入力の順のまま返すため、
    // 入れ替えないと入室の早い人がペアの中で常に先頭になり、最初のお題で先に話す（16の start の手順3）
    const shuffled = shuffle(players, random);
    // 指定は8人で最大4組でペアの数を超えないため、すべての指定を満たす分け方が必ずある（16）
    const together = pinnedPairs ?? [];
    const teams: TeamPublic[] = formBalancedTeams(shuffled, sizes, random, { together }).map((members: Player[], index) => ({
      teamId: `t${index + 1}`,
      members: members.map((player) => player.id),
    }));
    const turnOrder = Array.from({ length: laps }, () => teams.map((team) => team.teamId)).flat();
    const deck = shuffle(
      target.cards.map((card) => card.id),
      random,
    );

    const publicState: TwoHeadedPublic = {
      setId: target.id,
      teams,
      turnOrder,
      turnIndex: 0,
      readyPlayerIds: [],
      speakingOrder: [],
      scores: teams.map((team) => ({ teamId: team.teamId, points: 0 })),
      turns: [],
      solvedThisTurn: 0,
      passedThisTurn: 0,
      lastCard: null,
      starters: target.starters.map((entry) => ({ ...entry })),
      turnSeconds,
      laps,
    };
    const gameSecret: TwoHeadedGameSecret = {
      deck,
      cursor: 0,
      currentCardId: null,
      cardsExplained: Object.fromEntries(teams.map((team) => [team.teamId, 0])),
      usedCards: [],
    };

    // 全員へ当てる側の値を送る。同じ部屋で続けて遊んだときに前のゲームのお題を画面に残さない（16の「送るときと値」）
    const secrets = new Map<string, TwoHeadedSecret>(players.map((player) => [player.id, { role: "guesser" }]));

    return {
      stage: STAGES.briefing,
      deadlineSeconds: STAGE_DEADLINE_SECONDS.briefing,
      publicState,
      secrets,
      gameSecret,
    };
  },

  handleAction: ({ room, publicState, gameSecret, playerId, action, payload }) => {
    if (gameSecret === undefined) {
      return { reject: { code: ERROR_CODES.invalidStage } };
    }
    switch (action) {
      case ACTIONS.ready:
        return handleReady(room, publicState, gameSecret, playerId);
      case ACTIONS.startTurn:
        return handleStartTurn(room, publicState, playerId);
      case ACTIONS.claimCorrect:
        return handleClaimCorrect(room, publicState, gameSecret, playerId, payload);
      case ACTIONS.passCard:
        return handlePassCard(room, publicState, gameSecret, playerId, payload);
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
        // 未readyを既読扱いにして最初の手番へ進む
        const readyPlayerIds = [...new Set([...publicState.readyPlayerIds, ...connectedPlayerIds(room)])];
        return beginTurn(room, { ...publicState, readyPlayerIds }, gameSecret, 0);
      }
      case STAGES.handoff: {
        // 1人では交互に話せないため、説明役のペアの接続中が2人未満なら手番を飛ばす。3人組は2人で進める（16）
        const members = explainerTeamOf(publicState)?.members ?? [];
        const connected = room.players.filter((player) => player.connected && members.includes(player.id)).length;
        if (connected < 2) {
          return endTurn(room, publicState, gameSecret, "skipped");
        }
        return { stage: STAGES.explaining, deadlineSeconds: publicState.turnSeconds };
      }
      case STAGES.explaining:
        return endTurn(room, publicState, gameSecret, "timeout");
      default:
        // debrief には締切を置かない。ここへは到達しない
        return {};
    }
  },

  rebuildSecret,

  validateContent,
};
