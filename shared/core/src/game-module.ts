// GameModuleインターフェース。共通コアはこれだけを通してゲームに触る（基本設計/05_ゲームモジュール.md）
import type { ContentSummary, Player, Room, SettingField } from "./types";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface GameTransition<TPublic, TResult, TGameSecret = unknown> {
  publicState?: TPublic;
  stage?: string;
  deadlineSeconds?: number;
  secrets?: Map<string, unknown>;
  // ゲームモジュールが呼び出しをまたいで保持する秘密状態。共通コアは中身を解釈せず、
  // storageのsecretsキーへ保存して次の呼び出しへ戻すだけとする（基本設計/01、ADR-0015）
  gameSecret?: TGameSecret;
  result?: TResult;
  reject?: { code: string };
}

// gameIdはregistryのキーが正である。モジュール側に持たせると二重管理になるため持たせない
export interface GameModule<TPublic, TSecret, TResult, TGameSecret = unknown> {
  title: string;
  /** 選択画面に出す1行の説明。何をする遊びかが分かる長さにする */
  tagline: string;
  /** 選択画面のアイコン（絵文字1〜2字）。画像を持たないため書体で描ける文字に限る */
  icon: string;
  playerCount: [number, number];
  /** ロビーのコンテンツ選択に出す見出し。共通コアはゲーム固有の語を持たない（不変条件4） */
  contentLabelJa: string;
  /** ロビーで変更できる設定の記述子。空配列なら設定の入力を出さない（ADR-0012） */
  settingsFields: SettingField[];

  listContents(): ContentSummary[];

  validateSettings(settings: unknown): ValidationResult;

  start(input: { players: Player[]; contentId: string; settings: unknown; seed: number }): {
    stage: string;
    deadlineSeconds: number;
    publicState: TPublic;
    secrets: Map<string, TSecret>;
    gameSecret?: TGameSecret;
  };

  handleAction(input: {
    room: Room;
    publicState: TPublic;
    gameSecret: TGameSecret | undefined;
    playerId: string;
    action: string;
    payload: unknown;
  }): GameTransition<TPublic, TResult, TGameSecret>;

  onDeadline(input: {
    room: Room;
    publicState: TPublic;
    gameSecret: TGameSecret | undefined;
  }): GameTransition<TPublic, TResult, TGameSecret>;

  /**
   * 再接続したプレイヤーへ送る秘密情報を作り直す（ADR-0029）。
   *
   * 保存済みの値は送った時点の形と内容のまま残り、デプロイをまたぐと旧版の値が新しい画面へ届くため、
   * 共通コアは保存済みの値の代わりにこの戻り値を送る。
   * 戻り値は、そのプレイヤーへ最後に送った秘密情報と一致させる。終局後や開示中は現在のステージと
   * 食い違う場合があるため、room.lifecycle と room.stage を見て場合分けする。
   * undefined を返すと秘密情報を送らない。例外を投げると共通コアは保存済みの値を送る。
   * 収録済みの全ゲームが実装したら必須にする
   */
  rebuildSecret?(input: {
    room: Room;
    publicState: TPublic;
    gameSecret: TGameSecret | undefined;
    playerId: string;
  }): TSecret | undefined;

  // CI用。ランタイムでは呼ばない
  validateContent(content: unknown): ValidationResult;
}
