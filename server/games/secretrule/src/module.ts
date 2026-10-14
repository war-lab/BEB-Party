// SECRET RULE ENGLISHのGameModule実装（基本設計/14_SECRETRULEゲームモジュール.md）。
//
// handleAction と onDeadline は純粋関数として書く。storage・WebSocket・時刻取得・Math.random に触らない。
// 乱数は共通コアが注入する seed からのみ作る（基本設計/05の呼び出し規約）。
import {
  createRandom,
  shuffle,
  type ContentSummary,
  type GameModule,
  type GameTransition,
  type Room,
  type ValidationResult,
} from "@beb/shared-core";
import {
  ACTIONS,
  CANDIDATE_COUNT,
  ERROR_CODES,
  MARKS_PER_PLAYER,
  MAX_CHARS,
  MAX_ROUNDS,
  MIN_WORDS,
  RANK_THRESHOLDS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  TESTS_PER_ROUND,
  WRITING_SECONDS,
  agreedCandidateOf,
  countChars,
  countWords,
  isFinalRound,
  normalizeSubmission,
  renderPhrase,
  type AnswerRecord,
  type CandidatePublic,
  type CandidateSpec,
  type Draft,
  type Mark,
  type ProofEntry,
  type Rank,
  type RuleSpec,
  type SecretPhase,
  type SecretRulePack,
  type SecretRulePublic,
  type SecretRuleResult,
  type SecretRuleSecret,
  type SecretRuleSettings,
  type Selection,
  type TestedResult,
} from "@beb/shared-secretrule";
import { PACKS, findPack, summarize } from "./packs";
import { comparisonKeyOf, satisfies } from "./rules";
import { validateContent } from "./validate-content";

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015）。
 *
 * 秘密の規則、避ける候補、判定の成否を公開状態に置けない（ADR-0003、ADR-0031）。
 */
export interface SecretRuleGameSecret {
  /** 秘密の規則。start で抽選する */
  ruleCandidateId: string;
  /** proving で満たしてはならない候補。start で抽選する */
  avoidCandidateId: string;
  /** 候補id -> 規則IDとパラメータ。抽選した6件分。判定のたびにコンテンツを引かない */
  rules: Record<string, RuleSpec>;
  /** 当番順の元になる参加者の並び。start で決める */
  turnOrder: string[];
  /** 現在の writing / proving の playerId -> 提出（正規化済み） */
  currentDrafts: Record<string, string>;
  /** 判定にかけた英文と成否。全ラウンド分 */
  tested: TestedResult[];
}

type Transition = GameTransition<SecretRulePublic, SecretRuleResult, SecretRuleGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): SecretRuleSettings {
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

// --- パック ---

function resolvePack(packId: string): SecretRulePack {
  const target = findPack(packId);
  if (target === undefined) {
    // 共通コアがconfigureとstartでcontentIdを検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録の規則パックid: ${packId}`);
  }
  return target;
}

function toPublicCandidate(pack: SecretRulePack, candidate: CandidateSpec): CandidatePublic {
  const phrase = pack.rulePhrases[candidate.ruleId];
  if (phrase === undefined) {
    // 検証5が言い回しの欠落を落とすため、ここへは到達しない
    throw new Error(`規則ID ${candidate.ruleId} の言い回しがパック ${pack.id} に無い`);
  }
  const rendered = renderPhrase(phrase, candidate);
  return { id: candidate.id, textEn: rendered.en, textJa: rendered.ja };
}

function specOf(candidate: CandidateSpec): RuleSpec {
  return { ruleId: candidate.ruleId, params: candidate.params } as RuleSpec;
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

function withCollected(collected: readonly string[], playerId: string): string[] {
  return collected.includes(playerId) ? [...collected] : [...collected, playerId];
}

/**
 * そのラウンドの当番順。turnOrder を roundIndex × 2 人ぶん左へ回転したもの（14の「判定にかける2件の決め方」）。
 *
 * 2人ずつ回転するため、4人以上の卓では隣り合うラウンドで先頭2人が重ならない。
 */
function turnOrderFor(gameSecret: SecretRuleGameSecret, roundIndex: number): string[] {
  const order = gameSecret.turnOrder;
  if (order.length === 0) {
    return [];
  }
  const shift = (roundIndex * TESTS_PER_ROUND) % order.length;
  return [...order.slice(shift), ...order.slice(0, shift)];
}

function sortByTurn(drafts: readonly Draft[], turn: readonly string[]): Draft[] {
  return [...drafts].sort((a, b) => turn.indexOf(a.playerId) - turn.indexOf(b.playerId));
}

/** 作者が接続している提出だけを、当番順に並べた下書きにする */
function eligibleDrafts(room: Room, gameSecret: SecretRuleGameSecret, roundIndex: number): Draft[] {
  const connected = connectedPlayerIds(room);
  const drafts = Object.entries(gameSecret.currentDrafts)
    .filter(([playerId]) => connected.includes(playerId))
    .map(([playerId, text]) => ({ playerId, text }));
  return sortByTurn(drafts, turnOrderFor(gameSecret, roundIndex));
}

// --- 秘密情報 ---

function ownResultsOf(gameSecret: SecretRuleGameSecret, playerId: string): SecretRuleSecret["results"] {
  return gameSecret.tested
    .filter((entry) => entry.playerId === playerId)
    .map((entry) => ({ roundIndex: entry.roundIndex, text: entry.text, passed: entry.passed }));
}

/**
 * 1人分の秘密情報を作る。共通コアは playerSecrets[playerId] を差し替えるため、常に全量を組み立てる。
 *
 * results は判定にかかった本人の英文の成否で、全ラウンド分を持たせる。どの時点で送っても
 * それまでに判定した分がすべて入るため、遷移と作り直しが同じ関数で済む（14の「送るときと値」）。
 */
function buildSecret(
  gameSecret: SecretRuleGameSecret,
  phase: SecretPhase,
  roundIndex: number,
  playerId: string,
  withDraft: boolean,
): SecretRuleSecret {
  const results = ownResultsOf(gameSecret, playerId);
  const draft = withDraft ? gameSecret.currentDrafts[playerId] : undefined;
  return draft === undefined ? { phase, roundIndex, results } : { phase, roundIndex, draft, results };
}

function secretsForAll(
  room: Room,
  gameSecret: SecretRuleGameSecret,
  phase: SecretPhase,
  roundIndex: number,
  withDraft: boolean,
): Map<string, SecretRuleSecret> {
  const secrets = new Map<string, SecretRuleSecret>();
  for (const player of room.players) {
    secrets.set(player.id, buildSecret(gameSecret, phase, roundIndex, player.id, withDraft));
  }
  return secrets;
}

// --- 結果 ---

function candidateOf(publicState: SecretRulePublic, candidateId: string): CandidatePublic {
  return publicState.candidates.find((entry) => entry.id === candidateId) ?? { id: candidateId, textEn: "", textJa: "" };
}

function rankOf(input: {
  solvedRound: number | null;
  wrongCount: number;
  proofPassedCount: number;
  playerCount: number;
}): Rank {
  const { solvedRound, wrongCount, proofPassedCount, playerCount } = input;
  if (solvedRound === null) {
    return "C";
  }
  if (
    solvedRound <= RANK_THRESHOLDS.solvedRoundForS &&
    wrongCount === 0 &&
    proofPassedCount === playerCount
  ) {
    return "S";
  }
  if (wrongCount <= RANK_THRESHOLDS.wrongLimitForA && proofPassedCount * 2 > playerCount) {
    return "A";
  }
  return "B";
}

function buildResult(
  room: Room,
  publicState: SecretRulePublic,
  gameSecret: SecretRuleGameSecret,
  proofEntries: ProofEntry[],
): SecretRuleResult {
  const correct = publicState.answers.find((answer) => answer.correct);
  const solvedRound = correct === undefined ? null : correct.roundIndex + 1;
  const wrongCount = publicState.answers.filter((answer) => !answer.correct).length;
  const proofPassedCount = proofEntries.filter((entry) => entry.passed).length;
  const playerCount = room.players.length;
  return {
    outcome: solvedRound === null ? "unsolved" : "solved",
    rank: rankOf({ solvedRound, wrongCount, proofPassedCount, playerCount }),
    rule: candidateOf(publicState, gameSecret.ruleCandidateId),
    avoid: candidateOf(publicState, gameSecret.avoidCandidateId),
    candidates: publicState.candidates.map((entry) => ({ ...entry })),
    tested: gameSecret.tested.map((entry) => ({ ...entry })),
    answers: publicState.answers.map((entry) => ({ ...entry })),
    solvedRound,
    wrongCount,
    proofEntries,
    proofPassedCount,
    playerCount,
  };
}

/** 正解しないまま終わる。秘密は送らない（最後に送った値は checking のまま。14の「送るときと値」） */
function finishUnsolved(room: Room, publicState: SecretRulePublic, gameSecret: SecretRuleGameSecret): Transition {
  const next: SecretRulePublic = { ...publicState, readyPlayerIds: [] };
  return {
    publicState: next,
    stage: STAGES.debrief,
    gameSecret,
    result: buildResult(room, next, gameSecret, []),
  };
}

// --- ステージ遷移 ---

/** writing へ入る。提出と前のラウンドの下書き・印・選択を空へ戻す */
function enterWriting(
  room: Room,
  publicState: SecretRulePublic,
  gameSecret: SecretRuleGameSecret,
  roundIndex: number,
): Transition {
  const nextSecret: SecretRuleGameSecret = { ...gameSecret, currentDrafts: {} };
  return {
    publicState: {
      ...publicState,
      roundIndex,
      readyPlayerIds: [],
      submittedPlayerIds: [],
      drafts: [],
      marks: [],
      selections: [],
    },
    stage: STAGES.writing,
    deadlineSeconds: publicState.writingSeconds,
    gameSecret: nextSecret,
    secrets: secretsForAll(room, nextSecret, "writing", roundIndex, false),
  };
}

/**
 * 判定して checking へ入る。
 *
 * 判定にかけた英文は成否と一緒に gameSecret.tested へ、成否を除いて公開状態の entries へ加える。
 * 成否は書いた本人の秘密にだけ入れる（ADR-0031）。
 */
function enterChecking(
  room: Room,
  publicState: SecretRulePublic,
  gameSecret: SecretRuleGameSecret,
  chosen: readonly Draft[],
  draftsForPublic: readonly Draft[],
): Transition {
  const rule = gameSecret.rules[gameSecret.ruleCandidateId];
  if (rule === undefined) {
    throw new Error("秘密の規則が gameSecret.rules に無い");
  }
  const roundIndex = publicState.roundIndex;
  const tested: TestedResult[] = chosen.map((draft) => ({
    roundIndex,
    playerId: draft.playerId,
    text: draft.text,
    passed: satisfies(rule, draft.text),
  }));
  const nextSecret: SecretRuleGameSecret = { ...gameSecret, tested: [...gameSecret.tested, ...tested] };
  return {
    publicState: {
      ...publicState,
      readyPlayerIds: [],
      drafts: draftsForPublic.map((draft) => ({ ...draft })),
      entries: [
        ...publicState.entries,
        ...tested.map((entry) => ({ roundIndex, playerId: entry.playerId, text: entry.text })),
      ],
      selections: [],
    },
    stage: STAGES.checking,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.checking,
    gameSecret: nextSecret,
    secrets: secretsForAll(room, nextSecret, "checking", roundIndex, false),
  };
}

/**
 * writing を終える。作者が接続している提出を選べる下書きとし、2件以下なら全件を判定して checking へ、
 * 3件以上なら choosing へ進む（14の「ステージの終わりの処理」）。
 */
function endWriting(room: Room, publicState: SecretRulePublic, gameSecret: SecretRuleGameSecret): Transition {
  const drafts = eligibleDrafts(room, gameSecret, publicState.roundIndex);
  if (drafts.length <= TESTS_PER_ROUND) {
    return enterChecking(room, publicState, gameSecret, drafts, drafts);
  }
  // choosing へ入るときは秘密を送らない。下書きは公開状態の drafts にある（14の「送るときと値」）
  return {
    publicState: { ...publicState, readyPlayerIds: [], drafts, marks: [] },
    stage: STAGES.choosing,
    deadlineSeconds: STAGE_DEADLINE_SECONDS.choosing,
    gameSecret,
  };
}

/**
 * choosing を終える。印の多い順に2件を選び、同数は当番順で決める（14の「判定にかける2件の決め方」）。
 *
 * 印の集計は勝敗を決める投票ではない。同数でも当番順で必ず決まる。
 * この時点で作者が切断している下書きは選ばず、残った件数だけ判定する。
 */
function endChoosing(room: Room, publicState: SecretRulePublic, gameSecret: SecretRuleGameSecret): Transition {
  const connected = connectedPlayerIds(room);
  const turn = turnOrderFor(gameSecret, publicState.roundIndex);
  const countOf = (playerId: string) =>
    publicState.marks.filter((mark) => mark.draftPlayerIds.includes(playerId)).length;
  const chosen = publicState.drafts
    .filter((draft) => connected.includes(draft.playerId))
    .sort((a, b) => countOf(b.playerId) - countOf(a.playerId) || turn.indexOf(a.playerId) - turn.indexOf(b.playerId))
    .slice(0, TESTS_PER_ROUND);
  return enterChecking(room, publicState, gameSecret, chosen, publicState.drafts);
}

/** 正解して proving へ入る。秘密の規則と避ける候補を公開する */
function enterProving(room: Room, publicState: SecretRulePublic, gameSecret: SecretRuleGameSecret): Transition {
  const nextSecret: SecretRuleGameSecret = { ...gameSecret, currentDrafts: {} };
  return {
    publicState: {
      ...publicState,
      readyPlayerIds: [],
      submittedPlayerIds: [],
      selections: [],
      solvedCandidateId: gameSecret.ruleCandidateId,
      avoidCandidateId: gameSecret.avoidCandidateId,
    },
    stage: STAGES.proving,
    deadlineSeconds: publicState.writingSeconds,
    gameSecret: nextSecret,
    secrets: secretsForAll(room, nextSecret, "proving", publicState.roundIndex, false),
  };
}

/**
 * checking を終える。接続中で候補を選んだ人の選択が揃っていれば回答とする
 * （14の「回答はラウンドの終わりに判定する」）。
 */
function endChecking(room: Room, publicState: SecretRulePublic, gameSecret: SecretRuleGameSecret): Transition {
  const agreed = agreedCandidateOf(publicState.selections, connectedPlayerIds(room));
  let next = publicState;
  if (agreed !== null) {
    const correct = agreed === gameSecret.ruleCandidateId;
    const answer: AnswerRecord = { roundIndex: publicState.roundIndex, candidateId: agreed, correct };
    next = { ...publicState, answers: [...publicState.answers, answer] };
    if (correct) {
      return enterProving(room, next, gameSecret);
    }
  }
  if (isFinalRound(next)) {
    return finishUnsolved(room, next, gameSecret);
  }
  return enterWriting(room, next, gameSecret, next.roundIndex + 1);
}

/**
 * proving を終える。秘密の規則を満たし、避ける候補を満たさない英文を通過とする。
 *
 * 提出は debrief へ入るときに結果へ写し、currentDrafts からは消さない。
 * 終局後の再接続で proving の秘密を作り直すためである（14のゲーム秘密状態）。
 */
function endProving(room: Room, publicState: SecretRulePublic, gameSecret: SecretRuleGameSecret): Transition {
  const rule = gameSecret.rules[gameSecret.ruleCandidateId];
  const avoid = gameSecret.rules[gameSecret.avoidCandidateId];
  if (rule === undefined || avoid === undefined) {
    throw new Error("秘密の規則か避ける候補が gameSecret.rules に無い");
  }
  const proofEntries: ProofEntry[] = room.players.flatMap((player) => {
    const text = gameSecret.currentDrafts[player.id];
    return text === undefined
      ? []
      : [{ playerId: player.id, text, passed: satisfies(rule, text) && !satisfies(avoid, text) }];
  });
  const next: SecretRulePublic = { ...publicState, readyPlayerIds: [] };
  return {
    publicState: next,
    stage: STAGES.debrief,
    gameSecret,
    result: buildResult(room, next, gameSecret, proofEntries),
  };
}

function endStage(room: Room, publicState: SecretRulePublic, gameSecret: SecretRuleGameSecret): Transition {
  switch (room.stage) {
    case STAGES.briefing:
      return enterWriting(room, publicState, gameSecret, 0);
    case STAGES.writing:
      return endWriting(room, publicState, gameSecret);
    case STAGES.choosing:
      return endChoosing(room, publicState, gameSecret);
    case STAGES.checking:
      return endChecking(room, publicState, gameSecret);
    case STAGES.proving:
      return endProving(room, publicState, gameSecret);
    default:
      return {};
  }
}

// --- action ---

function readField(payload: unknown, key: string): unknown {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  return (payload as Record<string, unknown>)[key];
}

function handleReady(
  room: Room,
  publicState: SecretRulePublic,
  gameSecret: SecretRuleGameSecret,
  playerId: string,
): Transition {
  const stage = room.stage;
  if (
    (stage !== STAGES.briefing && stage !== STAGES.choosing && stage !== STAGES.checking) ||
    !isParticipant(room, playerId)
  ) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  // 二重送信は拒否しない。結果に影響せず、再送で画面が止まる経路を作る方が害が大きい（収録6本と同じ）
  const readyPlayerIds = withCollected(publicState.readyPlayerIds, playerId);
  const next: SecretRulePublic = { ...publicState, readyPlayerIds };
  if (!allConnectedIn(room, readyPlayerIds)) {
    return { publicState: next };
  }
  return endStage(room, next, gameSecret);
}

/** 比較キーが、判定にかけた過去の英文か、現在のステージの他人の提出と一致するか（14の submit） */
function isDuplicate(gameSecret: SecretRuleGameSecret, playerId: string, text: string): boolean {
  const key = comparisonKeyOf(text);
  if (gameSecret.tested.some((entry) => comparisonKeyOf(entry.text) === key)) {
    return true;
  }
  return Object.entries(gameSecret.currentDrafts).some(
    ([owner, draft]) => owner !== playerId && comparisonKeyOf(draft) === key,
  );
}

function handleSubmit(
  room: Room,
  publicState: SecretRulePublic,
  gameSecret: SecretRuleGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  const stage = room.stage;
  if ((stage !== STAGES.writing && stage !== STAGES.proving) || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  const raw = readField(payload, "text");
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
  if (isDuplicate(gameSecret, playerId, text)) {
    return { reject: { code: ERROR_CODES.duplicate } };
  }

  // 上書きを許す。最後に受理した提出のみが有効になる（14の submit）
  const nextSecret: SecretRuleGameSecret = {
    ...gameSecret,
    currentDrafts: { ...gameSecret.currentDrafts, [playerId]: text },
  };
  const submittedPlayerIds = withCollected(publicState.submittedPlayerIds, playerId);
  const next: SecretRulePublic = { ...publicState, submittedPlayerIds };
  const phase: SecretPhase = stage === STAGES.writing ? "writing" : "proving";
  const own = new Map([[playerId, buildSecret(nextSecret, phase, publicState.roundIndex, playerId, true)]]);

  if (!allConnectedIn(room, submittedPlayerIds)) {
    return { publicState: next, gameSecret: nextSecret, secrets: own };
  }

  // 同じ遷移で全員へ秘密を送る場合は、後者が上書きする（14の「送るときと値」）
  const transition = endStage(room, next, nextSecret);
  const secrets = new Map<string, unknown>(own);
  for (const [id, secret] of transition.secrets ?? []) {
    secrets.set(id, secret);
  }
  return { ...transition, gameSecret: transition.gameSecret ?? nextSecret, secrets };
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry) => b.includes(entry));
}

function handleMark(room: Room, publicState: SecretRulePublic, playerId: string, payload: unknown): Transition {
  if (room.stage !== STAGES.choosing || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  const roundIndex = readField(payload, "roundIndex");
  if (typeof roundIndex !== "number" || roundIndex !== publicState.roundIndex) {
    return { reject: { code: ERROR_CODES.staleRound } };
  }
  const ids = readField(payload, "draftPlayerIds");
  const authors = publicState.drafts.map((draft) => draft.playerId);
  if (
    !Array.isArray(ids) ||
    ids.length > MARKS_PER_PLAYER ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => typeof id === "string" && authors.includes(id))
  ) {
    return { reject: { code: ERROR_CODES.invalidMark } };
  }

  const draftPlayerIds = ids as string[];
  const previous = publicState.marks.find((mark) => mark.playerId === playerId)?.draftPlayerIds ?? [];
  const others = publicState.marks.filter((mark) => mark.playerId !== playerId);
  const marks: Mark[] = draftPlayerIds.length === 0 ? others : [...others, { playerId, draftPlayerIds }];
  // 印が変わったら ready を解除する。先に送った ready が変わる前の印への合意として残らないようにする
  const changed = !sameMembers(previous, draftPlayerIds);
  return { publicState: { ...publicState, marks, readyPlayerIds: changed ? [] : publicState.readyPlayerIds } };
}

function handleSelect(room: Room, publicState: SecretRulePublic, playerId: string, payload: unknown): Transition {
  if (room.stage !== STAGES.checking || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  const roundIndex = readField(payload, "roundIndex");
  if (typeof roundIndex !== "number" || roundIndex !== publicState.roundIndex) {
    return { reject: { code: ERROR_CODES.staleRound } };
  }
  const candidateId = readField(payload, "candidateId");
  const wrong = publicState.answers.filter((answer) => !answer.correct).map((answer) => answer.candidateId);
  if (
    candidateId !== null &&
    (typeof candidateId !== "string" ||
      !publicState.candidates.some((entry) => entry.id === candidateId) ||
      wrong.includes(candidateId))
  ) {
    return { reject: { code: ERROR_CODES.invalidCandidate } };
  }

  const previous = publicState.selections.find((entry) => entry.playerId === playerId)?.candidateId ?? null;
  const others = publicState.selections.filter((entry) => entry.playerId !== playerId);
  const selections: Selection[] = candidateId === null ? others : [...others, { playerId, candidateId }];
  // 選択が変わったら全員の ready を解除する（14の「回答はラウンドの終わりに判定する」）
  const changed = previous !== candidateId;
  return {
    publicState: { ...publicState, selections, readyPlayerIds: changed ? [] : publicState.readyPlayerIds },
  };
}

// --- GameModule ---

export const secretRuleModule: GameModule<
  SecretRulePublic,
  SecretRuleSecret,
  SecretRuleResult,
  SecretRuleGameSecret
> = {
  title: "SECRET RULE ENGLISH",
  tagline: "英文を書いて試し、通る英文の隠れた規則を全員で見抜く",
  // 試験管の絵文字。収録6本のアイコンと重ならないものを選ぶ（14のロビーの記述子）
  icon: "\u{1F9EA}",
  playerCount: [2, 6],
  contentLabelJa: "規則パックを選ぶ",
  settingsFields: [
    {
      type: "number",
      key: "writingSeconds",
      labelJa: "英文を書く時間（秒）",
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

    // 候補・秘密の規則・避ける候補・当番順を先に固定する。handleAction にシードが渡らない（14の start）
    const candidates = shuffle(pack.candidates, random).slice(0, CANDIDATE_COUNT);
    const rule = candidates[Math.floor(random() * candidates.length)];
    const others = candidates.filter((entry) => entry !== rule);
    const avoid = others[Math.floor(random() * others.length)];
    if (rule === undefined || avoid === undefined) {
      // 検証3が候補8件以上を保証するため到達しない
      throw new Error(`規則パック ${pack.id} の候補が足りない`);
    }
    const turnOrder = shuffle(
      players.map((player) => player.id),
      random,
    );

    const rules: Record<string, RuleSpec> = {};
    for (const candidate of candidates) {
      rules[candidate.id] = specOf(candidate);
    }

    const publicState: SecretRulePublic = {
      packId: pack.id,
      candidates: candidates.map((candidate) => toPublicCandidate(pack, candidate)),
      roundIndex: 0,
      maxRounds: MAX_ROUNDS,
      readyPlayerIds: [],
      submittedPlayerIds: [],
      drafts: [],
      marks: [],
      entries: [],
      selections: [],
      answers: [],
      solvedCandidateId: null,
      avoidCandidateId: null,
      keyExpressions: pack.keyExpressions.map((entry) => ({ ...entry })),
      starters: pack.starters.map((entry) => ({ ...entry })),
      writingSeconds: readSettings(settings).writingSeconds,
    };

    const gameSecret: SecretRuleGameSecret = {
      ruleCandidateId: rule.id,
      avoidCandidateId: avoid.id,
      rules,
      turnOrder,
      currentDrafts: {},
      tested: [],
    };

    // 初期値を全員へ送る。続けて遊んだときに前のゲームの秘密を画面に残さない（14の「送るときと値」）
    const secrets = new Map<string, SecretRuleSecret>();
    for (const player of players) {
      secrets.set(player.id, { phase: "briefing", roundIndex: 0, results: [] });
    }

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
      case ACTIONS.submit:
        return handleSubmit(room, publicState, gameSecret, playerId, payload);
      case ACTIONS.mark:
        return handleMark(room, publicState, playerId, payload);
      case ACTIONS.select:
        return handleSelect(room, publicState, playerId, payload);
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

  // 遷移で最後に送った秘密と同じ値を返す（14の「再接続での作り直し」、ADR-0029）。
  // results は常に全ラウンドの本人分であり、ステージで変わるのは phase と draft の有無だけである
  rebuildSecret: ({ room, publicState, gameSecret, playerId }) => {
    if (gameSecret === undefined) {
      throw new Error("gameSecretが無いため秘密情報を作り直せない");
    }
    if (!isParticipant(room, playerId)) {
      // 共通コアは例外のときに保存済みの値を送る。誤った値を返すより安全である（13と同じ扱い）
      throw new Error(`参加者でない playerId: ${playerId}`);
    }
    const roundIndex = publicState.roundIndex;
    switch (room.stage) {
      case STAGES.briefing:
        return { phase: "briefing", roundIndex: 0, results: [] };
      case STAGES.writing:
      case STAGES.choosing:
        // choosing へ入るときは送らないため、最後に送った値は writing のまま
        return buildSecret(gameSecret, "writing", roundIndex, playerId, true);
      case STAGES.checking:
        return buildSecret(gameSecret, "checking", roundIndex, playerId, false);
      case STAGES.proving:
        return buildSecret(gameSecret, "proving", roundIndex, playerId, true);
      case STAGES.debrief:
        // 正解なしの終局は checking から送らずに進むため、最後に送った値は checking のまま
        return publicState.solvedCandidateId === null
          ? buildSecret(gameSecret, "checking", roundIndex, playerId, false)
          : buildSecret(gameSecret, "proving", roundIndex, playerId, true);
      default:
        throw new Error(`未知のステージ: ${room.stage}`);
    }
  },

  validateContent,
};
