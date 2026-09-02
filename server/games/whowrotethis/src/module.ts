// WHO WROTE THIS?のGameModule実装（基本設計/11_WHOWROTETHISゲームモジュール.md）。
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
  ERROR_CODES,
  MAX_CHARS,
  MIN_WORDS,
  POINTS_PER_CORRECT_GUESS,
  POINTS_PER_HIDDEN,
  ROUNDS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  WRITING_SECONDS,
  countChars,
  countWords,
  hintCountFor,
  isFinalRound,
  normalizeSubmission,
  type GuessRecord,
  type Question,
  type RevealedItem,
  type RoundRecord,
  type ScoreEntry,
  type WhoWroteThisPack,
  type WhoWroteThisPublic,
  type WhoWroteThisResult,
  type WhoWroteThisSecret,
  type WhoWroteThisSettings,
} from "@beb/shared-whowrotethis";
import { PACKS, findPack, summarize } from "./packs";
import { validateContent } from "./validate-content";

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015）。
 *
 * 提出テキストと作者の対応を公開状態に置けない。開示前の提出が見えると匿名性が崩れ、
 * 開示中の件の作者が見えると指名が成立しない（11の公開状態）。
 */
export interface WhoWroteThisGameSecret {
  /** 使う質問のid。開始時に抽選して固定する */
  questionIds: string[];
  /**
   * ラウンドごとの開示順（playerIdの並び）。
   *
   * 提出順を開示順にしない。早く書き終えた人が先頭に来ると、開示順そのものが
   * 英語力の手がかりになる（11の進行の要点）。
   */
  revealOrders: string[][];
  /** ラウンドごとの playerId -> 提出テキスト（正規化済み） */
  submissions: Record<string, string>[];
  /**
   * ラウンドごとの playerId -> 提出の識別子。開始時にseedから振る。
   *
   * 作者を表さない値であり、本人へは secret で、開示中の1件については公開状態で配る。
   * 提出テキストの一致で作者を判定すると、2人が同じ英文を出したとき作者でない側まで
   * 作者として扱われ、その人の指名UIが消えて締切まで進行が止まる。
   */
  submissionIds: Record<string, string>[];
  /** 表示中の件の playerId -> 指名先。judging で公開状態へ移して空へ戻す */
  currentGuesses: Record<string, string>;
}

type Transition = GameTransition<WhoWroteThisPublic, WhoWroteThisResult, WhoWroteThisGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): WhoWroteThisSettings {
  if (typeof settings === "object" && settings !== null && "writingSeconds" in settings) {
    const value = (settings as { writingSeconds: unknown }).writingSeconds;
    if (typeof value === "number") {
      return { writingSeconds: value };
    }
  }
  return { writingSeconds: WRITING_SECONDS.default };
}

function validateSettings(settings: unknown): ValidationResult {
  if (settings === undefined || settings === null) {
    return { valid: true };
  }
  if (typeof settings !== "object") {
    return { valid: false, reason: "settingsはオブジェクトである必要がある" };
  }
  if (!("writingSeconds" in settings)) {
    return { valid: true };
  }
  const value = (settings as { writingSeconds: unknown }).writingSeconds;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { valid: false, reason: "writingSecondsは整数である必要がある" };
  }
  if (value < WRITING_SECONDS.min || value > WRITING_SECONDS.max) {
    return {
      valid: false,
      reason: `writingSecondsは${WRITING_SECONDS.min}以上${WRITING_SECONDS.max}以下である必要がある`,
    };
  }
  return { valid: true };
}

// --- パックと質問の解決 ---

function resolvePack(packId: string): WhoWroteThisPack {
  const target = findPack(packId);
  if (target === undefined) {
    // 共通コアがconfigureとstartでcontentIdを検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録の質問パックid: ${packId}`);
  }
  return target;
}

function resolveQuestion(pack: WhoWroteThisPack, questionId: string | undefined): Question | undefined {
  return questionId === undefined ? undefined : pack.questions.find((entry) => entry.id === questionId);
}

// --- 秘密情報 ---

function levelOf(players: readonly Player[], playerId: string): Level {
  return players.find((player) => player.id === playerId)?.level ?? 1;
}

/**
 * 1人分の秘密情報を作る。
 *
 * 共通コアは playerSecrets[playerId] をペイロードごと差し替えるため、常に全体を組み立てる。
 * submission だけを返すと hintEn が消える（11の秘密情報）。
 */
function buildSecret(
  players: readonly Player[],
  question: Question,
  roundIndex: number,
  playerId: string,
  submission: string | undefined,
  submissionId: string,
): WhoWroteThisSecret {
  const hintEn = question.hintEn.slice(0, hintCountFor(levelOf(players, playerId)));
  return submission === undefined
    ? { roundIndex, hintEn, submissionId }
    : { roundIndex, hintEn, submission, submissionId };
}

/** そのラウンドの秘密情報を全員分作る。前のラウンドの提出が手元に残らないようにする */
function buildSecrets(
  players: readonly Player[],
  question: Question,
  roundIndex: number,
  submissions: Record<string, string>,
  submissionIds: Record<string, string>,
): Map<string, WhoWroteThisSecret> {
  const secrets = new Map<string, WhoWroteThisSecret>();
  for (const player of players) {
    secrets.set(
      player.id,
      buildSecret(players, question, roundIndex, player.id, submissions[player.id], submissionIds[player.id] ?? ""),
    );
  }
  return secrets;
}

/**
 * 1ラウンド分の提出の識別子を振る。
 *
 * playerIdから導かない。導くと、識別子から作者を逆算できる。
 * ラウンド内で衝突しないよう、重複したら引き直す。
 */
function assignSubmissionIds(players: readonly Player[], random: () => number): Record<string, string> {
  const used = new Set<string>();
  const ids: Record<string, string> = {};
  for (const player of players) {
    let id = Math.floor(random() * 0xffffffff).toString(36);
    while (id === "" || used.has(id)) {
      id = Math.floor(random() * 0xffffffff).toString(36);
    }
    used.add(id);
    ids[player.id] = id;
  }
  return ids;
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

function allConnectedIn(room: Room, collected: readonly string[]): boolean {
  const connected = connectedPlayerIds(room);
  return connected.length > 0 && connected.every((playerId) => collected.includes(playerId));
}

/** 作者を除く接続中の全員が指名を終えたか */
function allConnectedGuessed(room: Room, collected: readonly string[], authorId: string): boolean {
  const pending = connectedPlayerIds(room).filter((playerId) => playerId !== authorId);
  return pending.length > 0 && pending.every((playerId) => collected.includes(playerId));
}

function withCollected(collected: readonly string[], playerId: string): string[] {
  return collected.includes(playerId) ? [...collected] : [...collected, playerId];
}

/**
 * 現ラウンドの開示順を作る。
 *
 * `start` で固定した並びから、提出のある人だけを残す。提出が無い人の枠を空で開示しても
 * 指名の対象がない（11の進行の要点）。
 */
function revealOrderOf(publicState: WhoWroteThisPublic, gameSecret: WhoWroteThisGameSecret): string[] {
  const order = gameSecret.revealOrders[publicState.roundIndex] ?? [];
  const submissions = gameSecret.submissions[publicState.roundIndex] ?? {};
  return order.filter((playerId) => submissions[playerId] !== undefined);
}

// --- ステージ遷移 ---

/** writing を終えて開示へ進む。提出が0件ならそのラウンドを飛ばす */
function startGuessing(room: Room, publicState: WhoWroteThisPublic, gameSecret: WhoWroteThisGameSecret): Transition {
  const order = revealOrderOf(publicState, gameSecret);
  if (order.length === 0) {
    // 全員が席を外した場合の異常系。得点を動かさずに次へ進む（11のonDeadline）
    return finishRound(publicState, gameSecret);
  }
  return presentItem(publicState, gameSecret, 0, order);
}

/** index件目を開示して指名を受け付ける */
function presentItem(
  publicState: WhoWroteThisPublic,
  gameSecret: WhoWroteThisGameSecret,
  index: number,
  order: readonly string[],
): Transition {
  const authorId = order[index];
  const submissions = gameSecret.submissions[publicState.roundIndex] ?? {};
  const text = authorId === undefined ? undefined : submissions[authorId];
  if (authorId === undefined || text === undefined) {
    // orderは提出のある人だけで作るため到達しない
    return finishRound(publicState, gameSecret);
  }

  const submissionId = (gameSecret.submissionIds[publicState.roundIndex] ?? {})[authorId] ?? "";
  return {
    publicState: {
      ...publicState,
      presented: { index, total: order.length, text, submissionId, guessedPlayerIds: [] },
    },
    stage: STAGES.guessing,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.guessing,
    gameSecret: { ...gameSecret, currentGuesses: {} },
  };
}

/**
 * 表示中の件の答え合わせへ進む。得点はこの時点で確定し、以後は再計算しない。
 *
 * 未指名者は棄権として扱う（11のonDeadline）。
 */
function toJudging(publicState: WhoWroteThisPublic, gameSecret: WhoWroteThisGameSecret): Transition {
  const presented = publicState.presented;
  const order = revealOrderOf(publicState, gameSecret);
  const authorId = presented === null ? undefined : order[presented.index];
  if (presented === null || authorId === undefined) {
    return {};
  }

  const guesses: GuessRecord[] = Object.entries(gameSecret.currentGuesses).map(([playerId, targetPlayerId]) => ({
    playerId,
    targetPlayerId,
  }));

  let scores = publicState.scores;
  let correctCount = 0;
  for (const guess of guesses) {
    if (guess.targetPlayerId === authorId) {
      correctCount += 1;
      scores = addPoints(scores, guess.playerId, POINTS_PER_CORRECT_GUESS);
    }
  }
  if (correctCount === 0) {
    scores = addPoints(scores, authorId, POINTS_PER_HIDDEN);
  }

  const item: RevealedItem = {
    index: presented.index,
    text: presented.text,
    authorId,
    guesses,
  };

  return {
    publicState: {
      ...publicState,
      scores,
      revealedItems: [...publicState.revealedItems, item],
    },
    stage: STAGES.judging,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.judging,
    gameSecret: { ...gameSecret, currentGuesses: {} },
  };
}

/** 答え合わせを終えて次の件、または開示へ進む */
function advanceAfterJudging(publicState: WhoWroteThisPublic, gameSecret: WhoWroteThisGameSecret): Transition {
  const presented = publicState.presented;
  if (presented === null) {
    return finishRound(publicState, gameSecret);
  }
  const order = revealOrderOf(publicState, gameSecret);
  const nextIndex = presented.index + 1;
  if (nextIndex >= order.length) {
    return finishRound(publicState, gameSecret);
  }
  return presentItem(publicState, gameSecret, nextIndex, order);
}

/**
 * 現ラウンドを締めて開示へ進む。
 *
 * revealedItems を RoundRecord へ移して空へ戻す。確定した内訳は後から再計算しない
 * （コンテンツを差し替えても過去のラウンドの記録が動かないようにする。11の判定の規則）。
 */
function finishRound(publicState: WhoWroteThisPublic, gameSecret: WhoWroteThisGameSecret): Transition {
  const record: RoundRecord = {
    questionId: gameSecret.questionIds[publicState.roundIndex] ?? "",
    question: { ...publicState.question },
    items: publicState.revealedItems.map((item) => ({ ...item })),
  };

  const nextPublic: WhoWroteThisPublic = {
    ...publicState,
    presented: null,
    revealedItems: [],
    readyPlayerIds: [],
    rounds: [...publicState.rounds, record],
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
function startNextRound(room: Room, publicState: WhoWroteThisPublic, gameSecret: WhoWroteThisGameSecret): Transition {
  const nextIndex = publicState.roundIndex + 1;
  const pack = resolvePack(publicState.packId);
  const question = resolveQuestion(pack, gameSecret.questionIds[nextIndex]);
  if (question === undefined) {
    // questionIds は totalRounds と同じ長さで作るため到達しない。到達した場合は開示に留める
    return {};
  }

  const nextPublic: WhoWroteThisPublic = {
    ...publicState,
    roundIndex: nextIndex,
    question: { en: question.en, ja: question.ja },
    readyPlayerIds: [],
    submittedPlayerIds: [],
    presented: null,
    revealedItems: [],
  };

  return {
    publicState: nextPublic,
    stage: STAGES.briefing,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.briefing,
    secrets: buildSecrets(room.players, question, nextIndex, {}, gameSecret.submissionIds[nextIndex] ?? {}),
  };
}

// --- action ---

function handleReady(
  room: Room,
  publicState: WhoWroteThisPublic,
  gameSecret: WhoWroteThisGameSecret,
  playerId: string,
): Transition {
  const stage = room.stage;
  if ((stage !== STAGES.briefing && stage !== STAGES.reveal) || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  // 二重送信は拒否しない。結果に影響せず、再送で画面が止まる経路を作る方が害が大きい（08・09・10と同じ扱い）
  const readyPlayerIds = withCollected(publicState.readyPlayerIds, playerId);
  const next: WhoWroteThisPublic = { ...publicState, readyPlayerIds };

  if (!allConnectedIn(room, readyPlayerIds)) {
    return { publicState: next };
  }

  if (stage === STAGES.briefing) {
    return { publicState: next, stage: STAGES.writing, deadlineSeconds: publicState.writingSeconds };
  }
  return startNextRound(room, next, gameSecret);
}

function readText(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  return (payload as { text?: unknown }).text;
}

function handleSubmit(
  room: Room,
  publicState: WhoWroteThisPublic,
  gameSecret: WhoWroteThisGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.writing || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  const raw = readText(payload);
  if (typeof raw !== "string") {
    return { reject: { code: ERROR_CODES.invalidSubmission } };
  }
  const text = normalizeSubmission(raw);
  if (countWords(text) < MIN_WORDS) {
    return { reject: { code: ERROR_CODES.tooShort } };
  }
  if (countChars(text) > MAX_CHARS) {
    return { reject: { code: ERROR_CODES.tooLong } };
  }

  // 上書きを許す。締切まで書き直せる方が英文を組み立てる過程に合う（11のsubmit）
  const submissions = gameSecret.submissions.map((entry, index) =>
    index === publicState.roundIndex ? { ...entry, [playerId]: text } : entry,
  );
  const nextSecret: WhoWroteThisGameSecret = { ...gameSecret, submissions };

  const submittedPlayerIds = withCollected(publicState.submittedPlayerIds, playerId);
  const next: WhoWroteThisPublic = { ...publicState, submittedPlayerIds };

  const pack = resolvePack(publicState.packId);
  const question = resolveQuestion(pack, gameSecret.questionIds[publicState.roundIndex]);
  const submissionId = (gameSecret.submissionIds[publicState.roundIndex] ?? {})[playerId] ?? "";
  const secrets =
    question === undefined
      ? undefined
      : new Map([
          [playerId, buildSecret(room.players, question, publicState.roundIndex, playerId, text, submissionId)],
        ]);

  if (!allConnectedIn(room, submittedPlayerIds)) {
    return { publicState: next, gameSecret: nextSecret, secrets };
  }

  const transition = startGuessing(room, next, nextSecret);
  return { ...transition, gameSecret: transition.gameSecret ?? nextSecret, secrets };
}

function readGuess(payload: unknown): { index: unknown; targetPlayerId: unknown } {
  if (typeof payload !== "object" || payload === null) {
    return { index: undefined, targetPlayerId: undefined };
  }
  const source = payload as { index?: unknown; targetPlayerId?: unknown };
  return { index: source.index, targetPlayerId: source.targetPlayerId };
}

function handleGuess(
  room: Room,
  publicState: WhoWroteThisPublic,
  gameSecret: WhoWroteThisGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  const presented = publicState.presented;
  if (room.stage !== STAGES.guessing || presented === null || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  const { index, targetPlayerId } = readGuess(payload);
  // 開示が次の件へ進んだ後に届いた指名を弾く（11のguess）
  if (typeof index !== "number" || index !== presented.index) {
    return { reject: { code: ERROR_CODES.staleGuess } };
  }

  const order = revealOrderOf(publicState, gameSecret);
  const authorId = order[presented.index];
  if (authorId === playerId) {
    return { reject: { code: ERROR_CODES.ownSubmission } };
  }
  // 二重送信は拒否する。得点に直結する入力であり、上書きを許すと締切直前の変更が続く
  if (presented.guessedPlayerIds.includes(playerId)) {
    return { reject: { code: ERROR_CODES.alreadyGuessed } };
  }
  if (
    typeof targetPlayerId !== "string" ||
    targetPlayerId === playerId ||
    !publicState.submittedPlayerIds.includes(targetPlayerId)
  ) {
    return { reject: { code: ERROR_CODES.invalidTarget } };
  }

  const guessedPlayerIds = withCollected(presented.guessedPlayerIds, playerId);
  const next: WhoWroteThisPublic = { ...publicState, presented: { ...presented, guessedPlayerIds } };
  const nextSecret: WhoWroteThisGameSecret = {
    ...gameSecret,
    currentGuesses: { ...gameSecret.currentGuesses, [playerId]: targetPlayerId },
  };

  if (!allConnectedGuessed(room, guessedPlayerIds, authorId ?? "")) {
    return { publicState: next, gameSecret: nextSecret };
  }
  return toJudging(next, nextSecret);
}

// --- GameModule ---

export const whoWroteThisModule: GameModule<
  WhoWroteThisPublic,
  WhoWroteThisSecret,
  WhoWroteThisResult,
  WhoWroteThisGameSecret
> = {
  title: "WHO WROTE THIS?",
  tagline: "英語で書いた1文を並べ、誰が書いたか当てる",
  icon: "✍️",
  playerCount: [5, 6],
  contentLabelJa: "お題を選ぶ",
  settingsFields: [
    {
      type: "number",
      key: "writingSeconds",
      labelJa: "英作文の秒数",
      min: WRITING_SECONDS.min,
      max: WRITING_SECONDS.max,
      step: WRITING_SECONDS.step,
      default: WRITING_SECONDS.default,
    },
  ],

  listContents: (): ContentSummary[] => PACKS.map(summarize),

  validateSettings,

  start: ({ players, contentId, settings, seed }) => {
    const random = createRandom(seed);
    const pack = resolvePack(contentId);

    // 使う質問を先に固定する。ラウンドごとに抽選するとhandleActionにシードが要る（11のstart）
    const questionIds = shuffle(
      pack.questions.map((question) => question.id),
      random,
    ).slice(0, ROUNDS);

    // 開示順も全ラウンド分をここで決める。提出順を開示順にしない（11の進行の要点）
    const revealOrders = questionIds.map(() =>
      shuffle(
        players.map((player: Player) => player.id),
        random,
      ),
    );

    // 提出の識別子も全ラウンド分をここで振る。作者を表さない値にするため、
    // playerIdからは導かず乱数から作る（11の「作者は自分の件で指名しない」）
    const submissionIds = questionIds.map(() => assignSubmissionIds(players, random));

    const first = resolveQuestion(pack, questionIds[0]);
    const publicState: WhoWroteThisPublic = {
      packId: pack.id,
      roundIndex: 0,
      totalRounds: questionIds.length,
      question: first === undefined ? { en: "", ja: "" } : { en: first.en, ja: first.ja },
      keyExpressions: pack.keyExpressions.map((entry) => ({ ...entry })),
      readyPlayerIds: [],
      submittedPlayerIds: [],
      presented: null,
      revealedItems: [],
      scores: players.map((player: Player) => ({ playerId: player.id, points: 0 })),
      rounds: [],
      writingSeconds: readSettings(settings).writingSeconds,
    };

    return {
      stage: STAGES.briefing,
      deadlineSeconds: STAGE_DEADLINE_SECONDS.briefing,
      publicState,
      secrets: first === undefined ? new Map() : buildSecrets(players, first, 0, {}, submissionIds[0] ?? {}),
      gameSecret: {
        questionIds,
        revealOrders,
        submissions: questionIds.map(() => ({})),
        submissionIds,
        currentGuesses: {},
      },
    };
  },

  handleAction: ({ room, publicState, gameSecret, playerId, action, payload }) => {
    if (gameSecret === undefined) {
      return { reject: { code: ERROR_CODES.invalidStage } };
    }
    switch (action) {
      case ACTIONS.ready:
        return handleReady(room, publicState, gameSecret, playerId);
      case ACTIONS.submit:
        return handleSubmit(room, publicState, gameSecret, playerId, payload);
      case ACTIONS.guess:
        return handleGuess(room, publicState, gameSecret, playerId, payload);
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
        // 未readyを既読扱いにして英作文へ進む（11のonDeadline）
        const readyPlayerIds = [...new Set([...publicState.readyPlayerIds, ...connectedPlayerIds(room)])];
        return {
          publicState: { ...publicState, readyPlayerIds },
          stage: STAGES.writing,
          deadlineSeconds: publicState.writingSeconds,
        };
      }
      case STAGES.writing:
        return startGuessing(room, publicState, gameSecret);
      case STAGES.guessing:
        // 未指名者は棄権として扱う
        return toJudging(publicState, gameSecret);
      case STAGES.judging:
        return advanceAfterJudging(publicState, gameSecret);
      case STAGES.reveal:
        return startNextRound(room, publicState, gameSecret);
      default:
        return {};
    }
  },

  validateContent,
};
