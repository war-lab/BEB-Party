// DETECTIVESのGameModule実装（基本設計/08_DETECTIVESゲームモジュール.md）。
//
// すべて純粋関数として書く。storage・WebSocket・現在時刻・Math.random()に触らない（基本設計/05）。
import type { ContentSummary, GameModule, GameTransition, Room, ValidationResult } from "@beb/shared-core";
import {
  ACTIONS,
  CONSTRAINTS,
  ERROR_CODES,
  INVESTIGATION_SECONDS,
  RANDOM_CASE_ID,
  STAGES,
  STAGE_DEADLINE_SECONDS,
  questionTemplatesFor,
  type Case,
  type CastEntry,
  type ContradictionExplanation,
  type DetectivesPublic,
  type DetectivesResult,
  type DetectivesSecret,
  type DetectivesSettings,
  type Fact,
  type PlayerCountVariant,
  type TestimonyCard,
  type Variant,
} from "@beb/shared-detectives";
import { assignCast, pickCulpritVariant, type CastMember } from "./casting";
import { CASES, RANDOM_CASE_SUMMARY, findCase, summarize } from "./cases";
import { derive5p, has5p } from "./derive-5p";
import { createRandom, pickOne } from "./rng";
import { validateContent } from "./validate-content";

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015）。
 *
 * 犯人と投票先は開示まで伏せる必要があり、公開状態にも個別送信にも置けない。
 */
export interface DetectivesGameSecret {
  caseId: string;
  playerCountVariant: PlayerCountVariant;
  culpritCharacterId: string;
  culpritPlayerId: string;
  votes: { voterPlayerId: string; targetPlayerId: string }[];
}

type Transition = GameTransition<DetectivesPublic, DetectivesResult, DetectivesGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): DetectivesSettings {
  if (typeof settings === "object" && settings !== null && "investigationSeconds" in settings) {
    const value = (settings as { investigationSeconds: unknown }).investigationSeconds;
    if (typeof value === "number") {
      return { investigationSeconds: value };
    }
  }
  return { investigationSeconds: INVESTIGATION_SECONDS.default };
}

function validateSettings(settings: unknown): ValidationResult {
  if (settings === undefined || settings === null) {
    return { valid: true };
  }
  if (typeof settings !== "object") {
    return { valid: false, reason: "settingsはオブジェクトである必要がある" };
  }
  if (!("investigationSeconds" in settings)) {
    return { valid: true };
  }
  const value = (settings as { investigationSeconds: unknown }).investigationSeconds;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { valid: false, reason: "investigationSecondsは整数である必要がある" };
  }
  if (value < INVESTIGATION_SECONDS.min || value > INVESTIGATION_SECONDS.max) {
    return {
      valid: false,
      reason: `investigationSecondsは${INVESTIGATION_SECONDS.min}以上${INVESTIGATION_SECONDS.max}以下である必要がある`,
    };
  }
  return { valid: true };
}

// --- 事件データの展開 ---

/** 参加人数に応じた版を選ぶ。5人版の導出手順は基本設計/06 */
function expandForPlayers(base: Case, playerCount: number): { target: Case; variant: PlayerCountVariant } {
  if (playerCount < base.characters.length && has5p(base)) {
    return { target: derive5p(base), variant: "5p" };
  }
  return { target: base, variant: "6p" };
}

function resolveCase(caseId: string): Case {
  const target = findCase(caseId);
  if (target === undefined) {
    // 共通コアがconfigureとstartでcontentIdを検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録の事件id: ${caseId}`);
  }
  return target;
}

/**
 * 「おまかせ」が選ばれていれば、注入されたシードで事件を抽選する。
 *
 * 抽選をクライアントではなくここで行うのは、開始するまで誰も事件を知らない状態を作るためと、
 * 同じシードから同じ回を再現できるようにするためである（基本設計/05の呼び出し規約）。
 */
function selectCase(contentId: string, random: () => number): Case {
  if (contentId !== RANDOM_CASE_ID) {
    return resolveCase(contentId);
  }
  const picked = pickOne(CASES, random);
  if (picked === undefined) {
    throw new Error("収録されている事件が1件もない");
  }
  return picked;
}

/** 秘密状態から、そのゲームで使っている事件・版・バリアントを復元する */
function restore(gameSecret: DetectivesGameSecret): { target: Case; variant: Variant } {
  const base = resolveCase(gameSecret.caseId);
  const target = gameSecret.playerCountVariant === "5p" ? derive5p(base) : base;
  const variant = target.variants.find((entry) => entry.culprit === gameSecret.culpritCharacterId);
  if (variant === undefined) {
    throw new Error(`犯人バリアントが見つからない: ${gameSecret.culpritCharacterId}`);
  }
  return { target, variant };
}

// --- 秘密情報の組み立て ---

function toCard(fact: Fact, level: CastMember["level"]): TestimonyCard {
  return {
    factId: fact.id,
    textEn: fact.text[`${level}`],
    hintJa: fact.hintJa,
    disclosure: fact.disclosure,
    isLie: false,
  };
}

function buildSecrets(target: Case, cast: CastMember[], variant: Variant): Map<string, DetectivesSecret> {
  const secrets = new Map<string, DetectivesSecret>();

  for (const member of cast) {
    const isCulprit = member.characterId === variant.culprit;
    const cards = target.facts
      .filter((fact) => fact.owner === member.characterId)
      .map((fact) => {
        if (!isCulprit || fact.id !== variant.lie.replaces) {
          return toCard(fact, member.level);
        }
        // 犯人には嘘カードが差し替え済みで渡る。本人が嘘だと知らないとゲームが成立しない（08）
        return {
          factId: fact.id,
          textEn: variant.lie.text[`${member.level}`],
          hintJa: variant.lie.hintJa,
          disclosure: fact.disclosure,
          isLie: true,
        };
      });

    secrets.set(member.playerId, {
      characterId: member.characterId,
      isCulprit,
      cards,
      constraints: [...CONSTRAINTS[member.level]],
      questionTemplates: questionTemplatesFor(member.level),
    });
  }

  return secrets;
}

// --- 結果の組み立て ---

function levelByPlayerId(room: Room): Map<string, CastMember["level"]> {
  return new Map(room.players.map((player) => [player.id, player.level]));
}

function buildContradictions(
  target: Case,
  variant: Variant,
  publicState: DetectivesPublic,
  room: Room,
): ContradictionExplanation[] {
  const levels = levelByPlayerId(room);
  const playerOfCharacter = new Map(publicState.cast.map((entry) => [entry.characterId, entry.playerId]));
  const characterName = new Map(publicState.cast.map((entry) => [entry.characterId, entry.characterName]));
  const factById = new Map(target.facts.map((fact) => [fact.id, fact]));

  return variant.contradictions.map((contradiction) => ({
    meaningJa: contradiction.meaningJa,
    supportingCards: contradiction.requires
      // 嘘factはlieCardとして別に出す。他の矛盾のyieldsはカードではないため除く
      .filter((reference) => reference !== variant.lie.replaces && factById.has(reference))
      .map((reference) => {
        const fact = factById.get(reference) as Fact;
        const playerId = playerOfCharacter.get(fact.owner);
        // 配役されたプレイヤーのレベルの英文を出す。場で読み上げられた文と一致させるため（08）
        const level = (playerId !== undefined ? levels.get(playerId) : undefined) ?? 3;
        return {
          characterName: characterName.get(fact.owner) ?? fact.owner,
          textEn: fact.text[`${level}`],
        };
      }),
  }));
}

/** 最多票が犯人に一致すれば市民勝利。同数タイは犯人勝利とする（設計.md） */
function judge(votes: DetectivesGameSecret["votes"], culpritPlayerId: string): DetectivesResult["outcome"] {
  const tally = new Map<string, number>();
  for (const vote of votes) {
    tally.set(vote.targetPlayerId, (tally.get(vote.targetPlayerId) ?? 0) + 1);
  }
  let max = 0;
  for (const count of tally.values()) {
    max = Math.max(max, count);
  }
  if (max === 0) {
    return "culprit";
  }
  const top = [...tally.entries()].filter(([, count]) => count === max).map(([playerId]) => playerId);
  return top.length === 1 && top[0] === culpritPlayerId ? "citizens" : "culprit";
}

function buildResult(room: Room, publicState: DetectivesPublic, gameSecret: DetectivesGameSecret): DetectivesResult {
  const { target, variant } = restore(gameSecret);
  const culpritLevel = levelByPlayerId(room).get(gameSecret.culpritPlayerId) ?? 3;

  return {
    culprit: { playerId: gameSecret.culpritPlayerId, characterId: gameSecret.culpritCharacterId },
    lieCard: { textEn: variant.lie.text[`${culpritLevel}`], hintJa: variant.lie.hintJa },
    contradictions: buildContradictions(target, variant, publicState, room),
    votes: [...gameSecret.votes],
    outcome: judge(gameSecret.votes, gameSecret.culpritPlayerId),
    timelineEn: [...target.reveal.timelineEn],
    keyExpressions: target.reveal.keyExpressions.map((expression) => ({ ...expression })),
  };
}

// --- 進行 ---

function connectedPlayerIds(room: Room): string[] {
  // 「全員」の判定は接続中のプレイヤーのみを対象とする。切断者を待って進行が止まるのを防ぐ（設計.md）
  return room.players.filter((player) => player.connected).map((player) => player.id);
}

function isParticipant(room: Room, playerId: string): boolean {
  return room.players.some((player) => player.id === playerId);
}

function allConnectedIn(room: Room, collected: string[]): boolean {
  const connected = connectedPlayerIds(room);
  return connected.length > 0 && connected.every((playerId) => collected.includes(playerId));
}

function handleReady(room: Room, publicState: DetectivesPublic, playerId: string): Transition {
  if (room.stage !== STAGES.briefing || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  // 二重送信は拒否しない。結果に影響せず、再送で画面が止まる経路を作る方が害が大きい（08）
  const readyPlayerIds = publicState.readyPlayerIds.includes(playerId)
    ? publicState.readyPlayerIds
    : [...publicState.readyPlayerIds, playerId];
  const next: DetectivesPublic = { ...publicState, readyPlayerIds };

  if (!allConnectedIn(room, readyPlayerIds)) {
    return { publicState: next };
  }
  return {
    publicState: next,
    stage: STAGES.investigation,
    deadlineSeconds: publicState.investigationSeconds,
  };
}

/**
 * 捜査を切り上げて投票へ進む。
 *
 * 締切は上限であって下限ではない。会話が尽きた組を残り時間だけ待たせない（08）。
 * 早める操作をホストに限るのは、1人の判断で全員の会話を打ち切れないようにするためである。
 */
function handleEndInvestigation(room: Room, playerId: string): Transition {
  if (room.stage !== STAGES.investigation || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (room.players.find((player) => player.id === playerId)?.isHost !== true) {
    return { reject: { code: ERROR_CODES.notHost } };
  }
  return { stage: STAGES.voting, deadlineSeconds: STAGE_DEADLINE_SECONDS.voting };
}

function handleVote(
  room: Room,
  publicState: DetectivesPublic,
  gameSecret: DetectivesGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.voting || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }

  const targetPlayerId =
    typeof payload === "object" && payload !== null && "targetPlayerId" in payload
      ? (payload as { targetPlayerId: unknown }).targetPlayerId
      : undefined;

  // 自分への投票を禁止する。犯人が自分に投票して票を操作する余地をなくす（08）
  if (typeof targetPlayerId !== "string" || targetPlayerId === playerId || !isParticipant(room, targetPlayerId)) {
    return { reject: { code: ERROR_CODES.invalidTarget } };
  }
  // 投票の変更を許さない。1回目を確定とする（基本設計/03）
  if (gameSecret.votes.some((vote) => vote.voterPlayerId === playerId)) {
    return { reject: { code: ERROR_CODES.alreadyVoted } };
  }

  const votes = [...gameSecret.votes, { voterPlayerId: playerId, targetPlayerId }];
  const votedPlayerIds = [...publicState.votedPlayerIds, playerId];
  const nextPublic: DetectivesPublic = { ...publicState, votedPlayerIds };
  const nextSecret: DetectivesGameSecret = { ...gameSecret, votes };

  if (!allConnectedIn(room, votedPlayerIds)) {
    return { publicState: nextPublic, gameSecret: nextSecret };
  }
  return {
    publicState: nextPublic,
    gameSecret: nextSecret,
    stage: STAGES.reveal,
    result: buildResult(room, nextPublic, nextSecret),
  };
}

// --- GameModule ---

export const detectivesModule: GameModule<
  DetectivesPublic,
  DetectivesSecret,
  DetectivesResult,
  DetectivesGameSecret
> = {
  title: "ENGLISH DETECTIVES",
  playerCount: [5, 6],

  // 「おまかせ」を先頭に置く。ロビーの既定選択にするため（基本設計/02）
  listContents: (): ContentSummary[] => [RANDOM_CASE_SUMMARY, ...CASES.map(summarize)],

  validateSettings,

  start: ({ players, contentId, settings, seed }) => {
    const random = createRandom(seed);
    const base = selectCase(contentId, random);
    const { target, variant: playerCountVariant } = expandForPlayers(base, players.length);

    const cast = assignCast(players, target.characters, random);
    const variant = pickCulpritVariant(cast, target.variants, random);
    const culprit = cast.find((member) => member.characterId === variant.culprit) as CastMember;

    const publicState: DetectivesPublic = {
      caseId: target.id,
      briefing: { ...target.briefing },
      cast: cast.map(
        (member): CastEntry => ({
          playerId: member.playerId,
          characterId: member.characterId,
          characterName: member.characterName,
        }),
      ),
      readyPlayerIds: [],
      votedPlayerIds: [],
      investigationSeconds: readSettings(settings).investigationSeconds,
    };

    return {
      stage: STAGES.briefing,
      deadlineSeconds: STAGE_DEADLINE_SECONDS.briefing,
      publicState,
      secrets: buildSecrets(target, cast, variant),
      gameSecret: {
        caseId: target.id,
        playerCountVariant,
        culpritCharacterId: variant.culprit,
        culpritPlayerId: culprit.playerId,
        votes: [],
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
      case ACTIONS.endInvestigation:
        return handleEndInvestigation(room, playerId);
      case ACTIONS.vote:
        return handleVote(room, publicState, gameSecret, playerId, payload);
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
        // 未readyを既読扱いにして捜査へ進む（08）
        const readyPlayerIds = [...new Set([...publicState.readyPlayerIds, ...connectedPlayerIds(room)])];
        return {
          publicState: { ...publicState, readyPlayerIds },
          stage: STAGES.investigation,
          deadlineSeconds: publicState.investigationSeconds,
        };
      }
      case STAGES.investigation:
        return { stage: STAGES.voting, deadlineSeconds: STAGE_DEADLINE_SECONDS.voting };
      case STAGES.voting:
        // 未投票は棄権とする。棄権は集計の分母にも分子にも入れない（08）
        return { stage: STAGES.reveal, result: buildResult(room, publicState, gameSecret) };
      default:
        // revealには締切を置かない。ここへは到達しない
        return {};
    }
  },

  validateContent,
};
