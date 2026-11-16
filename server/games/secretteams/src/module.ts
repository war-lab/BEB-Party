// SECRET TEAMSのGameModule実装（基本設計/17_SECRETTEAMSゲームモジュール.md）。
//
// handleAction と onDeadline は純粋関数として書く。storage・WebSocket・時刻取得・Math.random に触らない。
// 乱数は共通コアが注入する seed からのみ作る（基本設計/05の呼び出し規約）。
// 判定は回答の allyIds とチームの照合、テーマのidの一致だけで決まる。英語の説明を解釈しない（不変条件1）。
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
  ANSWERING_SECONDS,
  BRIEFING_SECONDS,
  CLUE_SECONDS,
  ERROR_CODES,
  LAPS,
  NEAR_THEMES_PER_FAMILY,
  STAGES,
  TEAM_SIZES,
  joinValueOf,
  maxAllyPicksOf,
  speakerOf,
  teamScoreOf,
  totalTurnsOf,
  type Answer,
  type AnswerRecord,
  type SecretTeamsPack,
  type SecretTeamsPublic,
  type SecretTeamsResult,
  type SecretTeamsSecret,
  type SecretTeamsSettings,
  type TeamResult,
  type ThemeChoice,
  type WordCard,
} from "@beb/shared-secretteams";
import { PACKS, findPack, summarize } from "./packs";
import { validateContent } from "./validate-content";

/** チーム1つ。所属は gameSecret にだけ持ち、本人にも配らない（17のゲーム秘密状態） */
export interface TeamSecret {
  themeId: string;
  playerIds: string[];
}

/**
 * ゲームモジュールが呼び出しをまたいで保持する秘密状態（ADR-0015、17のゲーム秘密状態）。
 *
 * 本物のテーマと近いテーマの区別は、teams[].themeId に載っているかで決まる。別のフィールドを置くと二重管理になる。
 */
export interface SecretTeamsGameSecret {
  /** 2件。start で決める */
  teams: TeamSecret[];
  /** playerId -> 配った単語。再接続と結果の組み立てでコンテンツを引かないために持つ */
  words: Record<string, WordCard>;
  /** playerId -> 回答。answering で受理したもの */
  answers: Record<string, Answer>;
}

type Transition = GameTransition<SecretTeamsPublic, SecretTeamsResult, SecretTeamsGameSecret>;

// --- 設定 ---

function readSettings(settings: unknown): SecretTeamsSettings {
  if (typeof settings === "object" && settings !== null && "clueSeconds" in settings) {
    const value = (settings as { clueSeconds: unknown }).clueSeconds;
    if (typeof value === "number") {
      return { clueSeconds: value };
    }
  }
  return { clueSeconds: CLUE_SECONDS.default };
}

function validateSettings(settings: unknown): ValidationResult {
  if (settings === undefined || settings === null) {
    return { valid: true };
  }
  if (typeof settings !== "object") {
    return { valid: false, reason: "settingsはオブジェクトである必要がある" };
  }
  if (!("clueSeconds" in settings)) {
    return { valid: true };
  }
  const value = (settings as { clueSeconds: unknown }).clueSeconds;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { valid: false, reason: "clueSecondsは整数である必要がある" };
  }
  if (value < CLUE_SECONDS.min || value > CLUE_SECONDS.max) {
    return {
      valid: false,
      reason: `clueSecondsは${CLUE_SECONDS.min}以上${CLUE_SECONDS.max}以下である必要がある`,
    };
  }
  return { valid: true };
}

// --- パック ---

function resolvePack(packId: string): SecretTeamsPack {
  const target = findPack(packId);
  if (target === undefined) {
    // 共通コアがconfigureとstartでcontentIdを検証するため、ここへは到達しない（基本設計/01）
    throw new Error(`未登録のテーマパックid: ${packId}`);
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

function isConnected(room: Room, playerId: string | undefined): boolean {
  return room.players.some((player) => player.id === playerId && player.connected);
}

/** 接続中の全員が collected にいるか。接続中が0人なら揃っていない */
function allConnectedIn(room: Room, collected: readonly string[]): boolean {
  const connected = connectedPlayerIds(room);
  return connected.length > 0 && connected.every((playerId) => collected.includes(playerId));
}

function withCollected(collected: readonly string[], playerId: string): string[] {
  return collected.includes(playerId) ? [...collected] : [...collected, playerId];
}

function teamOf(gameSecret: SecretTeamsGameSecret, playerId: string): TeamSecret | undefined {
  return gameSecret.teams.find((team) => team.playerIds.includes(playerId));
}

function readField(payload: unknown, key: string): unknown {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  return (payload as Record<string, unknown>)[key];
}

// --- 秘密情報 ---

/**
 * 1人分の秘密情報を作る。値は gameSecret の words・teams・answers だけから決まる（17の「再接続での作り直し」）。
 *
 * 共通コアは playerSecrets[playerId] を差し替えるため、常に全量を組み立てる。
 * 参加者でなければ undefined を返す。
 */
function buildSecret(gameSecret: SecretTeamsGameSecret, playerId: string): SecretTeamsSecret | undefined {
  const word = gameSecret.words[playerId];
  const team = teamOf(gameSecret, playerId);
  if (word === undefined || team === undefined) {
    return undefined;
  }
  const answer = gameSecret.answers[playerId];
  const base: SecretTeamsSecret = { word: { ...word }, themeId: team.themeId };
  return answer === undefined
    ? base
    : { ...base, answer: { allyIds: [...answer.allyIds], opponentThemeId: answer.opponentThemeId } };
}

// --- 結果 ---

function buildResult(room: Room, publicState: SecretTeamsPublic, gameSecret: SecretTeamsGameSecret): SecretTeamsResult {
  const choiceOf = (themeId: string): ThemeChoice => {
    const found = publicState.themeChoices.find((choice) => choice.id === themeId);
    if (found === undefined) {
      // start が本物のテーマを themeChoices に入れるため到達しない
      throw new Error(`テーマ ${themeId} が themeChoices に無い`);
    }
    return { ...found };
  };

  // 参加者は開始時のチームの全員とする。room.players の順に並べる
  const participants = room.players
    .map((player) => player.id)
    .filter((playerId) => teamOf(gameSecret, playerId) !== undefined);

  const records = new Map<string, AnswerRecord>();
  for (const playerId of participants) {
    const team = teamOf(gameSecret, playerId) as TeamSecret;
    const opponent = gameSecret.teams.find((entry) => entry !== team);
    const answer = gameSecret.answers[playerId];
    if (answer === undefined) {
      // 回答しなかった人は合流と見抜きの両方を0として数える（17の「合流率と見抜き率」）
      records.set(playerId, { playerId, answer: null, correctAllyCount: 0, wrongAllyCount: 0, themeCorrect: false });
      continue;
    }
    const correctAllyCount = answer.allyIds.filter((allyId) => team.playerIds.includes(allyId)).length;
    records.set(playerId, {
      playerId,
      answer: { allyIds: [...answer.allyIds], opponentThemeId: answer.opponentThemeId },
      correctAllyCount,
      wrongAllyCount: answer.allyIds.length - correctAllyCount,
      themeCorrect: opponent !== undefined && answer.opponentThemeId === opponent.themeId,
    });
  }

  const teams: TeamResult[] = gameSecret.teams.map((team) => {
    const allyCount = team.playerIds.length - 1;
    let joinSum = 0;
    let spotSum = 0;
    for (const playerId of team.playerIds) {
      const record = records.get(playerId);
      if (record === undefined || record.answer === null) {
        continue;
      }
      joinSum += joinValueOf(record.correctAllyCount, record.wrongAllyCount, allyCount);
      spotSum += record.themeCorrect ? 1 : 0;
    }
    // 平均の分母は開始時のチームの人数とし、切断した人も含める（17の「合流率と見抜き率」）
    const joinRate = joinSum / team.playerIds.length;
    const spotRate = spotSum / team.playerIds.length;
    return {
      theme: choiceOf(team.themeId),
      members: team.playerIds.map((playerId) => ({
        playerId,
        word: { ...(gameSecret.words[playerId] as WordCard) },
      })),
      joinRate,
      spotRate,
      score: teamScoreOf(joinRate, spotRate),
    };
  });

  const [first, second] = teams;
  const draw = first === undefined || second === undefined || first.score === second.score;
  const winner = draw ? undefined : (first.score > second.score ? first : second);
  return {
    outcome: draw ? "draw" : "win",
    winnerThemeId: winner === undefined ? null : winner.theme.id,
    teams,
    themeChoices: publicState.themeChoices.map((choice) => ({ ...choice })),
    answers: participants.map((playerId) => records.get(playerId) as AnswerRecord),
    playerCount: participants.length,
  };
}

// --- ステージ遷移 ---

/** answering へ入る。回答の収集を空へ戻す。秘密は送らない（17の「送るときと値」） */
function enterAnswering(publicState: SecretTeamsPublic): Transition {
  return {
    publicState: { ...publicState, submittedPlayerIds: [] },
    stage: STAGES.answering,
    deadlineSeconds: ANSWERING_SECONDS,
  };
}

/**
 * from 番目以降の手番へ入る。手番の人が切断していれば飛ばして skippedTurns に記録する（17の「手番の進め方」）。
 *
 * 最後の手番まで誰も接続していなければ answering へ進む。turnIndex は最後の手番の値にする。
 */
function enterTurn(room: Room, publicState: SecretTeamsPublic, from: number): Transition {
  const total = totalTurnsOf(publicState);
  const skippedTurns = [...publicState.skippedTurns];
  for (let turnIndex = from; turnIndex < total; turnIndex += 1) {
    if (isConnected(room, speakerOf({ speakerOrder: publicState.speakerOrder, turnIndex }))) {
      return {
        publicState: { ...publicState, turnIndex, skippedTurns },
        stage: STAGES.clue,
        deadlineSeconds: publicState.clueSeconds,
      };
    }
    skippedTurns.push(turnIndex);
  }
  return enterAnswering({ ...publicState, turnIndex: Math.max(0, total - 1), skippedTurns });
}

/** answering を終える。得点を計算し、result を返して reveal へ進む。締切を置かない */
function endAnswering(room: Room, publicState: SecretTeamsPublic, gameSecret: SecretTeamsGameSecret): Transition {
  return {
    publicState,
    stage: STAGES.reveal,
    result: buildResult(room, publicState, gameSecret),
  };
}

function endStage(room: Room, publicState: SecretTeamsPublic, gameSecret: SecretTeamsGameSecret): Transition {
  switch (room.stage) {
    case STAGES.briefing:
      // 未readyは既読として扱う。最初の手番の人が切断していれば飛ばす
      return enterTurn(room, publicState, 0);
    case STAGES.clue:
      return enterTurn(room, publicState, publicState.turnIndex + 1);
    case STAGES.answering:
      // 締切で未回答の人は、回答しなかった人として数える
      return endAnswering(room, publicState, gameSecret);
    default:
      return {};
  }
}

// --- action ---

function handleReady(
  room: Room,
  publicState: SecretTeamsPublic,
  gameSecret: SecretTeamsGameSecret,
  playerId: string,
): Transition {
  if (room.stage !== STAGES.briefing || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  // 二重送信は拒否しない。結果に影響せず、再送で画面が止まる経路を作る方が害が大きい（収録8本と同じ）
  const readyPlayerIds = withCollected(publicState.readyPlayerIds, playerId);
  const next: SecretTeamsPublic = { ...publicState, readyPlayerIds };
  if (!allConnectedIn(room, readyPlayerIds)) {
    return { publicState: next };
  }
  return endStage(room, next, gameSecret);
}

function handleDone(
  room: Room,
  publicState: SecretTeamsPublic,
  gameSecret: SecretTeamsGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.clue || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  if (speakerOf(publicState) !== playerId) {
    return { reject: { code: ERROR_CODES.notSpeaker } };
  }
  // 1周目の done が遅れて届いても、2周目の同じ人の手番を終えない（17の done）
  const turnIndex = readField(payload, "turnIndex");
  if (typeof turnIndex !== "number" || turnIndex !== publicState.turnIndex) {
    return { reject: { code: ERROR_CODES.staleTurn } };
  }
  return endStage(room, publicState, gameSecret);
}

/** submit の allyIds を検査する。受理できれば重複の無い配列を返し、できなければ拒否のコードを返す */
function checkAllies(
  room: Room,
  publicState: SecretTeamsPublic,
  playerId: string,
  allyIds: readonly unknown[],
): string[] | null {
  if (allyIds.length === 0 || allyIds.length > publicState.maxAllyPicks) {
    return null;
  }
  const checked: string[] = [];
  for (const allyId of allyIds) {
    if (typeof allyId !== "string" || allyId === playerId || !isParticipant(room, allyId) || checked.includes(allyId)) {
      return null;
    }
    checked.push(allyId);
  }
  return checked;
}

function handleSubmit(
  room: Room,
  publicState: SecretTeamsPublic,
  gameSecret: SecretTeamsGameSecret,
  playerId: string,
  payload: unknown,
): Transition {
  if (room.stage !== STAGES.answering || !isParticipant(room, playerId)) {
    return { reject: { code: ERROR_CODES.invalidStage } };
  }
  const rawAllies = readField(payload, "allyIds");
  const opponentThemeId = readField(payload, "opponentThemeId");
  if (!Array.isArray(rawAllies) || typeof opponentThemeId !== "string") {
    return { reject: { code: ERROR_CODES.invalidAnswer } };
  }
  const allyIds = checkAllies(room, publicState, playerId, rawAllies);
  if (allyIds === null) {
    return { reject: { code: ERROR_CODES.invalidAlly } };
  }
  // 自分のテーマは相手のテーマになりえない。拒否から分かるのは本人が知っている自分のテーマだけである（17の submit）
  const ownTheme = teamOf(gameSecret, playerId)?.themeId;
  if (!publicState.themeChoices.some((choice) => choice.id === opponentThemeId) || opponentThemeId === ownTheme) {
    return { reject: { code: ERROR_CODES.invalidTheme } };
  }

  // 上書きを許す。最後に受理した回答のみが有効になる
  const nextSecret: SecretTeamsGameSecret = {
    ...gameSecret,
    answers: { ...gameSecret.answers, [playerId]: { allyIds, opponentThemeId } },
  };
  const submittedPlayerIds = withCollected(publicState.submittedPlayerIds, playerId);
  const next: SecretTeamsPublic = { ...publicState, submittedPlayerIds };
  const own = new Map<string, unknown>();
  const secret = buildSecret(nextSecret, playerId);
  if (secret !== undefined) {
    own.set(playerId, secret);
  }

  if (!allConnectedIn(room, submittedPlayerIds)) {
    return { publicState: next, gameSecret: nextSecret, secrets: own };
  }
  // 最後の回答で reveal へ進む遷移にも本人の秘密を載せる（17の「送るときと値」）
  return { ...endAnswering(room, next, nextSecret), gameSecret: nextSecret, secrets: own };
}

// --- start ---

interface Drawn {
  /** 系統ごとの [本物のテーマ, 近いテーマ, 近いテーマ] */
  families: { real: ThemeChoiceWithWords; near: ThemeChoice[] }[];
}

interface ThemeChoiceWithWords extends ThemeChoice {
  words: WordCard[];
}

/** 系統を2つ抽選し、それぞれから本物のテーマ1件と近いテーマ2件を抽選する（17の start の手順5） */
function drawThemes(pack: SecretTeamsPack, random: () => number): Drawn {
  const families = shuffle(pack.families, random).slice(0, 2);
  if (families.length < 2) {
    // 検証3が系統2件以上を保証するため到達しない
    throw new Error(`テーマパック ${pack.id} の系統が足りない`);
  }
  return {
    families: families.map((family) => {
      const themes = shuffle(family.themes, random).slice(0, 1 + NEAR_THEMES_PER_FAMILY);
      const [real, ...near] = themes;
      if (real === undefined || near.length < NEAR_THEMES_PER_FAMILY) {
        // 検証3が各系統のテーマ3件以上を保証するため到達しない
        throw new Error(`系統 ${family.id} のテーマが足りない`);
      }
      return {
        real: { id: real.id, en: real.en, ja: real.ja, words: real.words.map((word) => ({ ...word })) },
        near: near.map((theme) => ({ id: theme.id, en: theme.en, ja: theme.ja })),
      };
    }),
  };
}

// --- GameModule ---

export const secretTeamsModule: GameModule<
  SecretTeamsPublic,
  SecretTeamsSecret,
  SecretTeamsResult,
  SecretTeamsGameSecret
> = {
  title: "SECRET TEAMS",
  tagline: "自分の単語を英語で遠回しに説明し、誰が味方かを見抜く",
  // 演劇の仮面の絵文字。収録8本のアイコンと重ならないものを選ぶ（17のロビーの記述子）
  icon: "\u{1F3AD}",
  playerCount: [4, 8],
  contentLabelJa: "テーマパックを選ぶ",
  settingsFields: [
    {
      type: "number",
      key: "clueSeconds",
      labelJa: "1人の説明の時間（秒）",
      min: CLUE_SECONDS.min,
      max: CLUE_SECONDS.max,
      step: CLUE_SECONDS.step,
      default: CLUE_SECONDS.default,
    },
  ],

  listContents: (): ContentSummary[] => PACKS.map(summarize),

  validateSettings,

  start: ({ players, contentId, settings, seed }) => {
    // 1〜3. パック・設定・乱数
    const pack = resolvePack(contentId);
    const { clueSeconds } = readSettings(settings);
    const random = createRandom(seed);

    // 4. 2チームに分ける
    const sizes = TEAM_SIZES[players.length];
    if (sizes === undefined) {
      // 共通コアが playerCount で人数を検証するため到達しない
      throw new Error(`対応していない人数: ${players.length}`);
    }
    const grouped = formBalancedTeams(players, sizes, random);

    // 5〜6. 系統とテーマを抽選し、先頭のチームから順に本物のテーマを割り当てる
    const drawn = drawThemes(pack, random);
    const words: Record<string, WordCard> = {};
    const teams: TeamSecret[] = grouped.map((members, index) => {
      const family = drawn.families[index];
      if (family === undefined) {
        throw new Error(`チーム ${index} に割り当てる系統が無い`);
      }
      // 7. 本物のテーマの単語を shuffle して先頭からメンバーへ1つずつ配る
      const dealt = shuffle(family.real.words, random);
      members.forEach((player, position) => {
        const word = dealt[position];
        if (word === undefined) {
          // 検証4が単語6件以上（最大4人 + 2）を保証するため到達しない
          throw new Error(`テーマ ${family.real.id} の単語が足りない`);
        }
        words[player.id] = { ...word };
      });
      return { themeId: family.real.id, playerIds: members.map((player) => player.id) };
    });

    // 8. 選択肢6件を shuffle して固定する
    const themeChoices = shuffle(
      drawn.families.flatMap((family) => [
        { id: family.real.id, en: family.real.en, ja: family.real.ja },
        ...family.near.map((theme) => ({ ...theme })),
      ]),
      random,
    );

    // 9. 説明の順。チームの並びを参照せず、参加者全体を並べ直す（17の「説明の順番は公開し、チームと独立に決める」）
    const speakerOrder = shuffle(
      players.map((player) => player.id),
      random,
    );

    const publicState: SecretTeamsPublic = {
      packId: pack.id,
      themeChoices,
      teamSizes: [...sizes].sort((a, b) => b - a),
      maxAllyPicks: maxAllyPicksOf(sizes),
      speakerOrder,
      laps: LAPS,
      turnIndex: 0,
      skippedTurns: [],
      readyPlayerIds: [],
      submittedPlayerIds: [],
      keyExpressions: pack.keyExpressions.map((entry) => ({ ...entry })),
      clueSeconds,
    };

    const gameSecret: SecretTeamsGameSecret = { teams, words, answers: {} };

    // 10. 全員へ自分の単語とテーマを送る。続けて遊んだときに前のゲームの単語を画面に残さない
    const secrets = new Map<string, SecretTeamsSecret>();
    for (const player of players) {
      const secret = buildSecret(gameSecret, player.id);
      if (secret !== undefined) {
        secrets.set(player.id, secret);
      }
    }

    // 11. briefing から始める
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
      case ACTIONS.done:
        return handleDone(room, publicState, gameSecret, playerId, payload);
      case ACTIONS.submit:
        return handleSubmit(room, publicState, gameSecret, playerId, payload);
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

  // 遷移で最後に送った秘密と同じ値を返す（17の「再接続での作り直し」、ADR-0029）。
  // ステージと lifecycle では場合分けしない。回答は answering でしか受理しないため、answers の有無で一致する
  rebuildSecret: ({ gameSecret, playerId }) => {
    if (gameSecret === undefined) {
      // 共通コアは例外のときに保存済みの値を送る。誤った値を返すより安全である（14と同じ扱い）
      throw new Error("gameSecretが無いため秘密情報を作り直せない");
    }
    // 参加者でなければ undefined を返す。遷移でもその人へは送っていない（11と同じ扱い）
    return buildSecret(gameSecret, playerId);
  },

  validateContent,
};
