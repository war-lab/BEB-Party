// MIND MELDのGameModule実装（基本設計/15_MINDMELDゲームモジュール.md）。
//
// handleAction と onDeadline は純粋関数として書く。storage・WebSocket・時刻取得・Math.random に触らない。
// 乱数は共通コアが注入する seed からのみ作る（基本設計/05の呼び出し規約）。
// 一致の判定は照合キーの文字列一致と、人の申告と異議だけで決まる。英語の意味を解釈しない（不変条件1、ADR-0034）。
import {
  createRandom,
  formBalancedTeams,
  shuffle,
  type ContentSummary,
  type GameModule,
  type GameTransition,
  type Room,
  type ValidationResult,
} from "@beb/shared-core";
import {
  ACTIONS,
  BRIEFING_SECONDS,
  ERROR_CODES,
  INPUT_SECONDS,
  MAX_ATTEMPTS,
  MAX_ROUNDS,
  REVEAL_SECONDS,
  STAGES,
  TEAM_LABELS,
  TEAM_SIZES,
  checkWord,
  isClaimAccepted,
  isFinalRound,
  isNearKeys,
  matchKeyOf,
  pointsFor,
  promptKeysOf,
  type AttemptPublic,
  type MindMeldPack,
  type MindMeldPublic,
  type MindMeldResult,
  type MindMeldSecret,
  type MindMeldSettings,
  type PromptPublic,
  type RoundSummary,
  type Standing,
  type TeamAttempt,
  type TeamPublic,
} from "@beb/shared-mindmeld";
import { PACKS, findPack, summarize } from "./packs";
import { validateContent } from "./validate-content";

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015、15のゲーム秘密状態）。
 *
 * 後のラウンドのお題と、input 中の提出した語を公開状態に置けない（ADR-0003）。
 */
export interface MindMeldGameSecret {
  /** start で抽選した MAX_ROUNDS 件。出す順 */
  prompts: PromptPublic[];
  /** この試行の playerId -> 語（表示形）。input へ入るときに空へ戻し、reveal では消さない */
  currentWords: Record<string, string>;
  /** 3人組が語を出した試行の数。3人組が無ければ0のまま */
  trioTurns: number;
}

type Transition = GameTransition<MindMeldPublic, MindMeldResult, MindMeldGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): MindMeldSettings {
  if (typeof settings === "object" && settings !== null && "inputSeconds" in settings) {
    const value = (settings as { inputSeconds: unknown }).inputSeconds;
    if (typeof value === "number") {
      return { inputSeconds: value };
    }
  }
  return { inputSeconds: INPUT_SECONDS.default };
}

function validateSettings(settings: unknown): ValidationResult {
  if (settings === undefined || settings === null) {
    return { valid: true };
  }
  if (typeof settings !== "object") {
    return { valid: false, reason: "settingsはオブジェクトである必要がある" };
  }
  if (!("inputSeconds" in settings)) {
    return { valid: true };
  }
  const value = (settings as { inputSeconds: unknown }).inputSeconds;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { valid: false, reason: "inputSecondsは整数である必要がある" };
  }
  if (value < INPUT_SECONDS.min || value > INPUT_SECONDS.max) {
    return {
      valid: false,
      reason: `inputSecondsは${INPUT_SECONDS.min}以上${INPUT_SECONDS.max}以下である必要がある`,
    };
  }
  return { valid: true };
}

// --- パック ---

function resolvePack(packId: string): MindMeldPack {
  const target = findPack(packId);
  if (target === undefined) {
    // 共通コアがconfigureとstartでcontentIdを検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録のお題パックid: ${packId}`);
  }
  return target;
}

// --- 進行の補助 ---

function connectedPlayerIds(room: Room): string[] {
  return room.players.filter((player) => player.connected).map((player) => player.id);
}

function isParticipant(room: Room, playerId: string): boolean {
  return room.players.some((player) => player.id === playerId);
}

/** 対象のうち接続中の全員が collected にいるか。接続中の対象が0人なら揃っていない */
function allConnectedIn(room: Room, targets: readonly string[], collected: readonly string[]): boolean {
  const connected = connectedPlayerIds(room).filter((playerId) => targets.includes(playerId));
  return connected.length > 0 && connected.every((playerId) => collected.includes(playerId));
}

function withCollected(collected: readonly string[], playerId: string): string[] {
  return collected.includes(playerId) ? [...collected] : [...collected, playerId];
}

function teamOf(publicState: MindMeldPublic, playerId: string): TeamPublic | undefined {
  return publicState.teams.find((team) => team.memberIds.includes(playerId));
}

/** ラウンドの中で一致済みのチームのid */
function matchedTeamIds(attempts: readonly AttemptPublic[]): Set<string> {
  const matched = new Set<string>();
  for (const attempt of attempts) {
    for (const entry of attempt.teams) {
      if (entry.matched === true) {
        matched.add(entry.teamId);
      }
    }
  }
  return matched;
}

/**
 * チームのうち、この試行で語を出す人（15の「チームの編成と3人組」）。
 *
 * ペアは2人とも。3人組は (P, Q, R) の並びで、数え trioTurns が 0, 1, 2 のとき (P, Q)、(Q, R)、(R, P) とする。
 */
function speakersOf(team: TeamPublic, trioTurns: number): string[] {
  if (team.memberIds.length !== 3) {
    return [...team.memberIds];
  }
  const first = trioTurns % 3;
  return [team.memberIds[first] as string, team.memberIds[(first + 1) % 3] as string];
}

/** 現在の試行の開示済みの記録。reveal の間は attempts の末尾がそれにあたる */
function currentAttempt(publicState: MindMeldPublic): AttemptPublic | undefined {
  const last = publicState.attempts[publicState.attempts.length - 1];
  return last !== undefined && last.attemptIndex === publicState.attemptIndex ? last : undefined;
}

function readField(payload: unknown, key: string): unknown {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  return (payload as Record<string, unknown>)[key];
}

/** payload の roundIndex と attemptIndex が現在の値と一致するか（15の action の受理規則） */
function isCurrentAttempt(publicState: MindMeldPublic, payload: unknown): boolean {
  const roundIndex = readField(payload, "roundIndex");
  const attemptIndex = readField(payload, "attemptIndex");
  return (
    typeof roundIndex === "number" &&
    typeof attemptIndex === "number" &&
    roundIndex === publicState.roundIndex &&
    attemptIndex === publicState.attemptIndex
  );
}

// --- 秘密情報 ---

/** 1人分の秘密情報を作る。共通コアは playerSecrets[playerId] を差し替えるため、常に全量を組み立てる */
function buildSecret(roundIndex: number, attemptIndex: number, word: string | undefined): MindMeldSecret {
  return word === undefined ? { roundIndex, attemptIndex } : { roundIndex, attemptIndex, word };
}

/** input へ入るときに全員へ送る。前の試行の語を秘密から消すためである（15の「送るときと値」） */
function secretsForAll(room: Room, roundIndex: number, attemptIndex: number): Map<string, MindMeldSecret> {
  const secrets = new Map<string, MindMeldSecret>();
  for (const player of room.players) {
    secrets.set(player.id, buildSecret(roundIndex, attemptIndex, undefined));
  }
  return secrets;
}

// --- 結果 ---

function buildResult(room: Room, publicState: MindMeldPublic): MindMeldResult {
  const ordered = [...publicState.scores].sort((a, b) => b.points - a.points);
  const standings: Standing[] = ordered.map((score) => ({
    teamId: score.teamId,
    points: score.points,
    // 同点は同じ順位とし、順位を分ける基準を置かない（15の「得点」）
    place: 1 + publicState.scores.filter((other) => other.points > score.points).length,
    matchedCount: publicState.rounds.filter((round) =>
      round.matchedAt.some((entry) => entry.teamId === score.teamId && entry.attempt !== null),
    ).length,
  }));
  return {
    teams: publicState.teams.map((team) => ({ ...team, memberIds: [...team.memberIds] })),
    standings,
    rounds: publicState.rounds,
    playerCount: room.players.length,
  };
}

// --- ステージ遷移 ---

/**
 * input へ入る。一致していないチームの語を出す人を決め、提出を空へ戻し、全員へ秘密を送る。
 *
 * 3人組が語を出す試行に入るときに trioTurns を1つ進める（15の「ステージの終わりの処理」）。
 */
function enterInput(
  room: Room,
  publicState: MindMeldPublic,
  gameSecret: MindMeldGameSecret,
  next: { roundIndex: number; attemptIndex: number; usedKeys: string[]; attempts: AttemptPublic[] },
): Transition {
  const prompt = gameSecret.prompts[next.roundIndex];
  if (prompt === undefined) {
    // start が MAX_ROUNDS 件を固定するため到達しない
    throw new Error(`ラウンド ${next.roundIndex} のお題が gameSecret.prompts に無い`);
  }
  const matched = matchedTeamIds(next.attempts);
  let trioTurns = gameSecret.trioTurns;
  const activePlayerIds: string[] = [];
  for (const team of publicState.teams) {
    if (matched.has(team.id)) {
      continue;
    }
    activePlayerIds.push(...speakersOf(team, trioTurns));
    if (team.memberIds.length === 3) {
      trioTurns += 1;
    }
  }
  const nextSecret: MindMeldGameSecret = { ...gameSecret, currentWords: {}, trioTurns };
  return {
    publicState: {
      ...publicState,
      roundIndex: next.roundIndex,
      attemptIndex: next.attemptIndex,
      prompt: { ...prompt },
      activePlayerIds,
      submittedPlayerIds: [],
      readyPlayerIds: [],
      usedKeys: next.usedKeys,
      attempts: next.attempts,
    },
    stage: STAGES.input,
    deadlineSeconds: publicState.inputSeconds,
    gameSecret: nextSecret,
    secrets: secretsForAll(room, next.roundIndex, next.attemptIndex),
  };
}

/** 次のラウンドの最初の input へ入る。usedKeys はお題の語で初期化する（15の「使用済みの語」） */
function enterRound(room: Room, publicState: MindMeldPublic, gameSecret: MindMeldGameSecret, roundIndex: number): Transition {
  const prompt = gameSecret.prompts[roundIndex];
  if (prompt === undefined) {
    throw new Error(`ラウンド ${roundIndex} のお題が gameSecret.prompts に無い`);
  }
  return enterInput(room, publicState, gameSecret, {
    roundIndex,
    attemptIndex: 0,
    usedKeys: promptKeysOf(prompt.en),
    attempts: [],
  });
}

/**
 * input を終える。語を出した各チームの2語を attempts に加え、exact と near を計算して reveal へ進む。
 *
 * 締切で未提出の人は語を持たず、そのチームは一致せず申告もできない（15の「同時提出と一斉開示」）。
 * reveal と debrief へ入るときは秘密を送らない（15の「送るときと値」）。
 */
function endInput(publicState: MindMeldPublic, gameSecret: MindMeldGameSecret): Transition {
  const teams: TeamAttempt[] = [];
  for (const team of publicState.teams) {
    const speakers = publicState.activePlayerIds.filter((playerId) => team.memberIds.includes(playerId));
    if (speakers.length === 0) {
      continue;
    }
    const words = speakers.map((playerId) => ({ playerId, word: gameSecret.currentWords[playerId] ?? null }));
    const [first, second] = words.map((entry) => (entry.word === null ? null : matchKeyOf(entry.word)));
    const bothPresent = typeof first === "string" && typeof second === "string";
    const exact = bothPresent && first === second;
    const near = bothPresent && !exact && isNearKeys(first, second);
    teams.push({ teamId: team.id, words, exact, near, claim: null, matched: null });
  }
  return {
    publicState: {
      ...publicState,
      readyPlayerIds: [],
      attempts: [...publicState.attempts, { attemptIndex: publicState.attemptIndex, teams }],
    },
    stage: STAGES.reveal,
    deadlineSeconds: REVEAL_SECONDS,
    gameSecret,
  };
}

/**
 * reveal を終える。申告を判定し、一致したチームに点を加えて、次の試行・次のラウンド・debrief へ進む。
 *
 * 異議と判定者の数は、この時点の接続状態で数える。切断した人は異議を取り下げられないまま残るためである。
 */
function endReveal(room: Room, publicState: MindMeldPublic, gameSecret: MindMeldGameSecret): Transition {
  const attempt = currentAttempt(publicState);
  if (attempt === undefined) {
    // endInput が必ず加えるため到達しない
    throw new Error("reveal の試行の記録が attempts に無い");
  }
  const connected = connectedPlayerIds(room);
  const points = pointsFor(publicState.attemptIndex);
  const resolvedTeams: TeamAttempt[] = attempt.teams.map((entry) => {
    const members = publicState.teams.find((team) => team.id === entry.teamId)?.memberIds ?? [];
    let claim = entry.claim;
    if (claim !== null) {
      const judges = connected.filter((playerId) => !members.includes(playerId));
      const objectors = claim.objectorIds.filter((playerId) => judges.includes(playerId));
      claim = { ...claim, accepted: isClaimAccepted(objectors.length, judges.length) };
    }
    return { ...entry, claim, matched: entry.exact || claim?.accepted === true };
  });
  const resolved: AttemptPublic = { attemptIndex: attempt.attemptIndex, teams: resolvedTeams };
  const attempts = [...publicState.attempts.slice(0, -1), resolved];
  const scores = publicState.scores.map((score) =>
    resolvedTeams.some((entry) => entry.teamId === score.teamId && entry.matched === true)
      ? { ...score, points: score.points + points }
      : { ...score },
  );
  const matched = matchedTeamIds(attempts);
  const allMatched = publicState.teams.every((team) => matched.has(team.id));
  const lastAttempt = publicState.attemptIndex >= publicState.maxAttempts - 1;
  const settled: MindMeldPublic = { ...publicState, attempts, scores, readyPlayerIds: [] };

  if (!allMatched && !lastAttempt) {
    // 開示した語を usedKeys に加える。自分のペアに限らず全ペアの語を禁止する（15の「使用済みの語」）
    const usedKeys = [...publicState.usedKeys];
    for (const entry of resolvedTeams) {
      for (const word of entry.words) {
        const key = word.word === null ? null : matchKeyOf(word.word);
        if (key !== null && !usedKeys.includes(key)) {
          usedKeys.push(key);
        }
      }
    }
    return enterInput(room, settled, gameSecret, {
      roundIndex: publicState.roundIndex,
      attemptIndex: publicState.attemptIndex + 1,
      usedKeys,
      attempts,
    });
  }

  const prompt = publicState.prompt ?? gameSecret.prompts[publicState.roundIndex];
  if (prompt === undefined) {
    throw new Error(`ラウンド ${publicState.roundIndex} のお題が無い`);
  }
  const summary: RoundSummary = {
    roundIndex: publicState.roundIndex,
    prompt: { ...prompt },
    attempts,
    matchedAt: publicState.teams.map((team) => {
      const found = attempts.find((entry) =>
        entry.teams.some((teamEntry) => teamEntry.teamId === team.id && teamEntry.matched === true),
      );
      return { teamId: team.id, attempt: found === undefined ? null : found.attemptIndex + 1 };
    }),
  };
  const withRound: MindMeldPublic = { ...settled, rounds: [...publicState.rounds, summary] };

  if (isFinalRound(publicState)) {
    // debrief では roundIndex と attemptIndex を最後の試行のまま残す（15の「再接続での作り直し」）
    return {
      publicState: withRound,
      stage: STAGES.debrief,
      gameSecret,
      result: buildResult(room, withRound),
    };
  }
  return enterRound(room, withRound, gameSecret, publicState.roundIndex + 1);
}

function endStage(room: Room, publicState: MindMeldPublic, gameSecret: MindMeldGameSecret): Transition {
  switch (room.stage) {
    case STAGES.briefing:
      return enterRound(room, publicState, gameSecret, 0);
    case STAGES.input:
      return endInput(publicState, gameSecret);
    case STAGES.reveal:
      return endReveal(room, publicState, gameSecret);
    default:
      return {};
  }
}

// --- action ---

function handleReady(
  room: Room,
  publicState: MindMeldPublic,
  gameSecret: MindMeldGameSecret,
  playerId: string,
): Transition {
  if ((room.stage !== STAGES.briefing && room.stage !== STAGES.reveal) || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  // 二重送信は拒否しない。結果に影響せず、再送で画面が止まる経路を作る方が害が大きい（収録7本と同じ）
  const readyPlayerIds = withCollected(publicState.readyPlayerIds, playerId);
  const next: MindMeldPublic = { ...publicState, readyPlayerIds };
  if (!allConnectedIn(room, room.players.map((player) => player.id), readyPlayerIds)) {
    return { publicState: next };
  }
  return endStage(room, next, gameSecret);
}

function handleSubmit(
  room: Room,
  publicState: MindMeldPublic,
  gameSecret: MindMeldGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.input || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (!isCurrentAttempt(publicState, payload)) {
    return { reject: { code: ERROR_CODES.staleAttempt } };
  }
  if (!publicState.activePlayerIds.includes(playerId)) {
    return { reject: { code: ERROR_CODES.notActive } };
  }
  const raw = readField(payload, "word");
  const checked = typeof raw === "string" ? checkWord(raw) : null;
  if (checked === null || !checked.ok) {
    return { reject: { code: ERROR_CODES.invalidWord } };
  }
  if (publicState.usedKeys.includes(checked.key)) {
    return { reject: { code: ERROR_CODES.usedWord } };
  }

  // 上書きを許す。最後に受理した提出のみが有効になる。同じペアや他のペアと同じ語も拒否しない（15の submit）
  const nextSecret: MindMeldGameSecret = {
    ...gameSecret,
    currentWords: { ...gameSecret.currentWords, [playerId]: checked.display },
  };
  const submittedPlayerIds = withCollected(publicState.submittedPlayerIds, playerId);
  const next: MindMeldPublic = { ...publicState, submittedPlayerIds };
  const own = new Map<string, unknown>([
    [playerId, buildSecret(publicState.roundIndex, publicState.attemptIndex, checked.display)],
  ]);

  if (!allConnectedIn(room, publicState.activePlayerIds, submittedPlayerIds)) {
    return { publicState: next, gameSecret: nextSecret, secrets: own };
  }
  // 最後の提出で reveal へ進む遷移にも本人の秘密を載せる（15の「送るときと値」）
  const transition = endInput(next, nextSecret);
  return { ...transition, secrets: own };
}

function handleClaim(room: Room, publicState: MindMeldPublic, playerId: string, payload: unknown): Transition {
  if (room.stage !== STAGES.reveal || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (!isCurrentAttempt(publicState, payload)) {
    return { reject: { code: ERROR_CODES.staleAttempt } };
  }
  const team = teamOf(publicState, playerId);
  const attempt = currentAttempt(publicState);
  const entry = attempt?.teams.find((teamEntry) => teamEntry.teamId === team?.id);
  if (team === undefined || attempt === undefined || entry === undefined || !entry.near) {
    return { reject: { code: ERROR_CODES.notClaimable } };
  }
  if (entry.claim !== null) {
    // 2回目以降は状態を変えずに受理する。締切と ready を置き直すと reveal を延ばし続けられる（15の claim）
    return { publicState };
  }
  const teams = attempt.teams.map((teamEntry) =>
    teamEntry.teamId === team.id
      ? { ...teamEntry, claim: { claimedBy: playerId, objectorIds: [], accepted: null } }
      : teamEntry,
  );
  return {
    publicState: {
      ...publicState,
      attempts: [...publicState.attempts.slice(0, -1), { ...attempt, teams }],
      // 判定者が異議を出す時間を取るため、全員の ready を解除し締切を置き直す（15の「近い語の申告と異議」）
      readyPlayerIds: [],
    },
    deadlineSeconds: REVEAL_SECONDS,
  };
}

function handleObject(room: Room, publicState: MindMeldPublic, playerId: string, payload: unknown): Transition {
  if (room.stage !== STAGES.reveal || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (!isCurrentAttempt(publicState, payload)) {
    return { reject: { code: ERROR_CODES.staleAttempt } };
  }
  const teamId = readField(payload, "teamId");
  const objecting = readField(payload, "objecting");
  const attempt = currentAttempt(publicState);
  const entry = attempt?.teams.find((teamEntry) => teamEntry.teamId === teamId);
  const members = publicState.teams.find((team) => team.id === teamId)?.memberIds ?? [];
  if (
    typeof teamId !== "string" ||
    typeof objecting !== "boolean" ||
    attempt === undefined ||
    entry === undefined ||
    entry.claim === null ||
    members.includes(playerId)
  ) {
    return { reject: { code: ERROR_CODES.invalidObjection } };
  }
  // 異議は申告ごとに1人1件であり、objecting の値で置き換える。ready は解除しない（15の object）
  const others = entry.claim.objectorIds.filter((objector) => objector !== playerId);
  const objectorIds = objecting ? [...others, playerId] : others;
  const teams = attempt.teams.map((teamEntry) =>
    teamEntry.teamId === teamId && teamEntry.claim !== null
      ? { ...teamEntry, claim: { ...teamEntry.claim, objectorIds } }
      : teamEntry,
  );
  return {
    publicState: { ...publicState, attempts: [...publicState.attempts.slice(0, -1), { ...attempt, teams }] },
  };
}

// --- GameModule ---

export const mindMeldModule: GameModule<MindMeldPublic, MindMeldSecret, MindMeldResult, MindMeldGameSecret> = {
  title: "MIND MELD",
  tagline: "ペアで同時に英単語を出し、同じ語にそろうまで連想を寄せ合う",
  // 脳の絵文字。収録7本のアイコンと重ならないものを選ぶ（15のロビーの記述子）
  icon: "\u{1F9E0}",
  playerCount: [4, 8],
  tags: ["team"],
  contentLabelJa: "お題を選ぶ",
  settingsFields: [
    {
      type: "number",
      key: "inputSeconds",
      labelJa: "語を出す時間（秒）",
      min: INPUT_SECONDS.min,
      max: INPUT_SECONDS.max,
      step: INPUT_SECONDS.step,
      default: INPUT_SECONDS.default,
    },
  ],

  listContents: (): ContentSummary[] => PACKS.map(summarize),

  validateSettings,

  // 裏画面で主催者が指定した組を、必ず同じチームに入れる（15の「ペアの指定」、ADR-0035）
  acceptsPinnedPairs: true,

  start: ({ players, contentId, settings, seed, pinnedPairs }) => {
    const pack = resolvePack(contentId);
    const { inputSeconds } = readSettings(settings);
    const random = createRandom(seed);

    const sizes = TEAM_SIZES[players.length];
    if (sizes === undefined) {
      // 共通コアが playerCount で人数を検証するため到達しない
      throw new Error(`対応していない人数: ${players.length}`);
    }
    // 各チームの中の並びは入力（room.players）の順を保つ。3人組の交代の順になる（15の start）
    // 指定は8人で最大4組でチームの数を超えないため、すべての指定を満たす分け方が必ずある（15の「ペアの指定」）
    const together = pinnedPairs ?? [];
    const teams: TeamPublic[] = formBalancedTeams(players, sizes, random, { together }).map((members, index) => {
      const label = TEAM_LABELS[index] ?? String(index + 1);
      return { id: label.toLowerCase(), label, memberIds: members.map((player) => player.id) };
    });

    // お題を先に固定する。handleAction と onDeadline にシードが渡らない（15のゲーム秘密状態）
    const prompts = shuffle(pack.prompts, random)
      .slice(0, MAX_ROUNDS)
      .map((prompt) => ({ id: prompt.id, en: prompt.en, ja: prompt.ja }));
    if (prompts.length < MAX_ROUNDS) {
      // 検証3がお題12件以上を保証するため到達しない
      throw new Error(`お題パック ${pack.id} のお題が足りない`);
    }

    const publicState: MindMeldPublic = {
      packId: pack.id,
      teams,
      roundIndex: 0,
      maxRounds: MAX_ROUNDS,
      attemptIndex: 0,
      maxAttempts: MAX_ATTEMPTS,
      prompt: null,
      activePlayerIds: [],
      submittedPlayerIds: [],
      readyPlayerIds: [],
      usedKeys: [],
      attempts: [],
      rounds: [],
      scores: teams.map((team) => ({ teamId: team.id, points: 0 })),
      keyExpressions: pack.keyExpressions.map((entry) => ({ ...entry })),
      inputSeconds,
    };

    const gameSecret: MindMeldGameSecret = { prompts, currentWords: {}, trioTurns: 0 };

    // 初期値を全員へ送る。続けて遊んだときに前のゲームの秘密を画面に残さない（15の「送るときと値」）
    const secrets = new Map<string, MindMeldSecret>();
    for (const player of players) {
      secrets.set(player.id, buildSecret(0, 0, undefined));
    }

    return {
      stage: STAGES.briefing,
      deadlineSeconds: BRIEFING_SECONDS,
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
      case ACTIONS.submit:
        return handleSubmit(room, publicState, gameSecret, playerId, payload);
      case ACTIONS.claim:
        return handleClaim(room, publicState, playerId, payload);
      case ACTIONS.object:
        return handleObject(room, publicState, playerId, payload);
      default:
        return { reject: { code: ERROR_CODES.invalidStage } };
    }
  },

  onDeadline: ({ room, publicState, gameSecret }) => {
    if (gameSecret === undefined) {
      return {};
    }
    return endStage(room, publicState, gameSecret);
  },

  // 遷移で最後に送った秘密と同じ値を返す（15の「再接続での作り直し」、ADR-0029）
  rebuildSecret: ({ room, publicState, gameSecret, playerId }) => {
    if (gameSecret === undefined) {
      throw new Error("gameSecretが無いため秘密情報を作り直せない");
    }
    if (!isParticipant(room, playerId)) {
      // 共通コアは例外のときに保存済みの値を送る。誤った値を返すより安全である（13と同じ扱い）
      throw new Error(`参加者でない playerId: ${playerId}`);
    }
    switch (room.stage) {
      case STAGES.briefing:
        return buildSecret(0, 0, undefined);
      case STAGES.input:
      case STAGES.reveal:
      case STAGES.debrief:
        // currentWords は次の input へ入るときまで消さないため、reveal と debrief でも本人の語を引ける
        return buildSecret(publicState.roundIndex, publicState.attemptIndex, gameSecret.currentWords[playerId]);
      default:
        throw new Error(`未知のステージ: ${room.stage}`);
    }
  },

  validateContent,
};
