// ESCAPE CALLのGameModule実装（基本設計/13_ESCAPECALLゲームモジュール.md）。
//
// handleAction と onDeadline は純粋関数として書く。storage・WebSocket・時刻取得・Math.random に触らない。
// 乱数は共通コアが注入する seed からのみ作る（基本設計/05の呼び出し規約）。
import {
  ACTIONS,
  CODE_PATTERN,
  ERROR_CODES,
  ESCAPE_SECONDS,
  LOCK_COUNT,
  LOCK_SPECS,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  assignPieces,
  generateLocks,
  hintCountOf,
  kindsOf,
  rankOf,
  ruleTextFor,
  ruleTextJa,
  type EscapeCallPack,
  type EscapeCallPublic,
  type EscapeCallResult,
  type EscapeCallSecret,
  type EscapeCallSettings,
  type GeneratedLock,
  type HolderEntry,
  type LockSolution,
  type Piece,
} from "@beb/shared-escapecall";
import {
  createRandom,
  type ContentSummary,
  type GameModule,
  type GameTransition,
  type Player,
  type Room,
  type ValidationResult,
} from "@beb/shared-core";
import { PACKS, findPack, summarize } from "./packs";
import { validateContent } from "./validate-content";

/** 錠1つの秘密。答えと断片の割り当てを start で決めて持つ（13のゲーム秘密状態） */
export interface LockSecret extends GeneratedLock {
  /** playerId -> 断片 */
  assignments: Record<string, Piece[]>;
}

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015）。
 *
 * 錠の答え・並び・対応表・規則を公開状態に置けない。state は全員へブロードキャストされる（ADR-0003）。
 */
export interface EscapeCallGameSecret {
  locks: LockSecret[];
}

type Transition = GameTransition<EscapeCallPublic, EscapeCallResult, EscapeCallGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): EscapeCallSettings {
  const source = typeof settings === "object" && settings !== null ? (settings as Record<string, unknown>) : {};
  const seconds = source.escapeSeconds;
  return { escapeSeconds: typeof seconds === "number" ? seconds : ESCAPE_SECONDS.default };
}

function validateSettings(settings: unknown): ValidationResult {
  if (settings === undefined || settings === null) {
    return { valid: true };
  }
  if (typeof settings !== "object") {
    return { valid: false, reason: "settingsはオブジェクトである必要がある" };
  }
  const source = settings as Record<string, unknown>;
  if (!("escapeSeconds" in source)) {
    return { valid: true };
  }
  const value = source.escapeSeconds;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { valid: false, reason: "escapeSecondsは整数である必要がある" };
  }
  if (value < ESCAPE_SECONDS.min || value > ESCAPE_SECONDS.max) {
    return {
      valid: false,
      reason: `escapeSecondsは${ESCAPE_SECONDS.min}以上${ESCAPE_SECONDS.max}以下である必要がある`,
    };
  }
  return { valid: true };
}

// --- パック ---

function resolvePack(packId: string): EscapeCallPack {
  const target = findPack(packId);
  if (target === undefined) {
    // 共通コアがconfigureとstartでcontentIdを検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録の舞台パックid: ${packId}`);
  }
  return target;
}

// --- 秘密情報 ---

function holdersOf(lock: LockSecret | undefined): HolderEntry[] {
  if (lock === undefined) {
    return [];
  }
  return Object.entries(lock.assignments).map(([playerId, pieces]) => ({ playerId, kinds: kindsOf(pieces) }));
}

/**
 * いま挑戦中の錠の断片を全員分作る。
 *
 * 共通コアは playerSecrets[playerId] をペイロードごと差し替えるため、常に全量を組み立てる。
 * 前の錠の断片は入れない。結果画面で全員に開示するため持ち続ける理由がない（13の秘密情報）。
 */
function secretsFor(players: readonly Player[], lock: LockSecret | undefined, lockIndex: number): Map<string, EscapeCallSecret> {
  const secrets = new Map<string, EscapeCallSecret>();
  for (const player of players) {
    const pieces = lock?.assignments[player.id] ?? [];
    secrets.set(player.id, { lockIndex, pieces: JSON.parse(JSON.stringify(pieces)) as Piece[] });
  }
  return secrets;
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

// --- ステージ遷移 ---

/** 解錠へ進む。錠1の断片を全員へ配る */
function toSolving(room: Room, publicState: EscapeCallPublic, gameSecret: EscapeCallGameSecret): Transition {
  const lock = gameSecret.locks[0];
  return {
    publicState: { ...publicState, currentLockIndex: 0, holders: holdersOf(lock) },
    stage: STAGES.solving,
    deadlineSeconds: publicState.escapeSeconds,
    secrets: secretsFor(room.players, lock, 0),
  };
}

function solutionOf(
  pack: EscapeCallPack,
  publicState: EscapeCallPublic,
  lock: LockSecret,
  index: number,
): LockSolution {
  const label = publicState.locks[index];
  // 振り返りで見るのは場で実際に読み上げられた文。規則を持った人に配った英文を使う（13の結果）
  const delivered = Object.values(lock.assignments)
    .flat()
    .find((piece) => piece.kind === "rule");
  return {
    index,
    labelEn: label?.labelEn ?? "",
    labelJa: label?.labelJa ?? "",
    opened: label?.opened ?? false,
    order: [...lock.order],
    map: lock.map.map((entry) => ({ ...entry })),
    rules: lock.rules.map((rule, ruleIndex) => ({
      ruleId: rule.ruleId,
      textEn:
        delivered?.kind === "rule"
          ? (delivered.rules[ruleIndex]?.textEn ?? "")
          : ruleTextFor(pack.rulePhrases, rule, 3).textEn,
      textJa: ruleTextJa(pack.rulePhrases, rule),
    })),
    code: lock.code,
    holders: holdersOf(lock),
  };
}

/** ゲームを終える。開かなかった錠の答えと断片も結果に含める（13の結果） */
function finishGame(
  publicState: EscapeCallPublic,
  gameSecret: EscapeCallGameSecret,
  outcome: EscapeCallResult["outcome"],
): Transition {
  const pack = resolvePack(publicState.packId);
  const openedCount = publicState.locks.filter((lock) => lock.opened).length;
  const hintCount = publicState.hints.length;
  const wrongCount = publicState.attempts.filter((attempt) => !attempt.accepted).length;
  return {
    publicState,
    stage: STAGES.debrief,
    result: {
      outcome,
      rank: rankOf(outcome === "escaped", openedCount, hintCount, wrongCount),
      openedCount,
      hintCount,
      wrongCount,
      locks: gameSecret.locks.map((lock, index) => solutionOf(pack, publicState, lock, index)),
    },
  };
}

// --- action ---

function handleReady(
  room: Room,
  publicState: EscapeCallPublic,
  gameSecret: EscapeCallGameSecret,
  playerId: string,
): Transition {
  if (room.stage !== STAGES.briefing || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  // 二重送信は拒否しない。冪等に扱う（収録5本と同じ）
  const readyPlayerIds = publicState.readyPlayerIds.includes(playerId)
    ? [...publicState.readyPlayerIds]
    : [...publicState.readyPlayerIds, playerId];
  const next: EscapeCallPublic = { ...publicState, readyPlayerIds };

  const connected = connectedPlayerIds(room);
  if (connected.length === 0 || !connected.every((id) => readyPlayerIds.includes(id))) {
    return { publicState: next };
  }
  return toSolving(room, next, gameSecret);
}

function readField(payload: unknown, key: "code" | "lockIndex"): unknown {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  return (payload as Record<string, unknown>)[key];
}

/**
 * 操作した時点の錠が、いま挑戦中の錠と一致するか。
 * 錠が開いた直後に届いた前の錠への操作を、次の錠へ適用しないために見る（13のsubmit・hint）。
 */
function isCurrentLock(payload: unknown, lockIndex: number): boolean {
  return readField(payload, "lockIndex") === lockIndex;
}

function handleSubmit(
  room: Room,
  publicState: EscapeCallPublic,
  gameSecret: EscapeCallGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  const lockIndex = publicState.currentLockIndex;
  const lock = gameSecret.locks[lockIndex];
  const label = publicState.locks[lockIndex];
  if (room.stage !== STAGES.solving || !isParticipant(room, playerId) || lock === undefined || label === undefined) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  // 対象は常にいま挑戦中の錠。送られた錠番号は遅着の検出にだけ使う（13のsubmit）
  if (!isCurrentLock(payload, lockIndex)) {
    return { reject: { code: ERROR_CODES.staleLock } };
  }
  const code = readField(payload, "code");
  if (typeof code !== "string" || !CODE_PATTERN.test(code) || code.length !== label.codeLength) {
    return { reject: { code: ERROR_CODES.invalidCode } };
  }
  if (publicState.attempts.some((attempt) => attempt.lockIndex === lockIndex && attempt.code === code)) {
    return { reject: { code: ERROR_CODES.alreadyAttempted } };
  }

  const accepted = code === lock.code;
  const attempts = [...publicState.attempts, { lockIndex, playerId, code, accepted }];
  if (!accepted) {
    // 誤答に時間の罰則を置かない。ステージも締切も変えない（13の誤答に時間の罰則を置かない）
    return { publicState: { ...publicState, attempts } };
  }

  const nextIndex = lockIndex + 1;
  const locks = publicState.locks.map((entry) => (entry.index === lockIndex ? { ...entry, opened: true } : entry));
  const nextLock = gameSecret.locks[nextIndex];
  const nextPublic: EscapeCallPublic = {
    ...publicState,
    locks,
    attempts,
    currentLockIndex: nextIndex,
    holders: holdersOf(nextLock),
  };

  if (nextIndex >= LOCK_COUNT) {
    return finishGame(nextPublic, gameSecret, "escaped");
  }
  // deadlineSeconds を返さない。返すと共通コアが締切を置き直し、制限時間が延びる（13のステージ）
  return {
    publicState: nextPublic,
    secrets: secretsFor(room.players, nextLock, nextIndex),
  };
}

function handleHint(
  room: Room,
  publicState: EscapeCallPublic,
  gameSecret: EscapeCallGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  const lockIndex = publicState.currentLockIndex;
  const lock = gameSecret.locks[lockIndex];
  if (room.stage !== STAGES.solving || !isParticipant(room, playerId) || lock === undefined) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  // 場の合意でヒントを取る形にする。誰でも押せると1人の判断でランクが下がる（13のhint）
  if (!isHost(room, playerId)) {
    return { reject: { code: ERROR_CODES.notHost } };
  }
  if (!isCurrentLock(payload, lockIndex)) {
    return { reject: { code: ERROR_CODES.staleLock } };
  }
  const revealed = hintCountOf(publicState, lockIndex);
  // 全桁を開示すると錠を解く工程が消える。残り1桁なら10通りの総当たりで必ず開けられる
  if (revealed >= lock.code.length - 1) {
    return { reject: { code: ERROR_CODES.noMoreHints } };
  }
  return {
    publicState: {
      ...publicState,
      hints: [...publicState.hints, { lockIndex, position: revealed, digit: lock.code[revealed] as string }],
    },
  };
}

// --- GameModule ---

export const escapeCallModule: GameModule<EscapeCallPublic, EscapeCallSecret, EscapeCallResult, EscapeCallGameSecret> = {
  title: "ESCAPE CALL",
  tagline: "別々の手がかりを英語で伝え合い、3つの錠を開けて脱出する",
  icon: "🔐",
  playerCount: [2, 4],
  contentLabelJa: "舞台を選ぶ",
  settingsFields: [
    {
      type: "number",
      key: "escapeSeconds",
      labelJa: "制限時間（秒）",
      min: ESCAPE_SECONDS.min,
      max: ESCAPE_SECONDS.max,
      step: ESCAPE_SECONDS.step,
      default: ESCAPE_SECONDS.default,
    },
  ],

  listContents: (): ContentSummary[] => PACKS.map(summarize),

  validateSettings,

  start: ({ players, contentId, settings, seed }) => {
    const random = createRandom(seed);
    const pack = resolvePack(contentId);
    const { escapeSeconds } = readSettings(settings);

    // 3つの錠と断片の割り当てをここで全部決める。handleActionにシードが渡らない（基本設計/05）
    const participants = players.map((player) => ({ id: player.id, level: player.level }));
    const generated = generateLocks(random);
    const locks: LockSecret[] = generated.map((lock, index) => ({
      ...lock,
      assignments: assignPieces(lock, index, participants, random, (rule, level) =>
        ruleTextFor(pack.rulePhrases, rule, level),
      ),
    }));

    const publicState: EscapeCallPublic = {
      packId: pack.id,
      scene: { ...pack.scene },
      locks: LOCK_SPECS.map((spec, index) => ({
        index,
        labelEn: pack.lockLabels[index]?.en ?? "",
        labelJa: pack.lockLabels[index]?.ja ?? "",
        codeLength: spec.codeLength,
        opened: false,
      })),
      currentLockIndex: 0,
      holders: holdersOf(locks[0]),
      readyPlayerIds: [],
      attempts: [],
      hints: [],
      keyExpressions: pack.keyExpressions.map((entry) => ({ ...entry })),
      escapeSeconds,
    };

    // briefing 中は断片を配らない（13の秘密情報）
    const secrets = new Map<string, EscapeCallSecret>(
      players.map((player) => [player.id, { lockIndex: 0, pieces: [] }]),
    );

    return {
      stage: STAGES.briefing,
      deadlineSeconds: STAGE_DEADLINE_SECONDS.briefing,
      publicState,
      secrets,
      gameSecret: { locks },
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
      case ACTIONS.hint:
        return handleHint(room, publicState, gameSecret, playerId, payload);
      default:
        return { reject: { code: ERROR_CODES.invalidStage } };
    }
  },

  onDeadline: ({ room, publicState, gameSecret }) => {
    if (gameSecret === undefined) {
      return {};
    }
    switch (room.stage) {
      case STAGES.briefing:
        // 未readyを既読扱いにして解錠へ進む（13のonDeadline）
        return toSolving(room, publicState, gameSecret);
      case STAGES.solving:
        return finishGame(publicState, gameSecret, "time_up");
      default:
        return {};
    }
  },

  validateContent,
};
