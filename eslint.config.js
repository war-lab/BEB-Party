// @ts-check
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";
import globals from "globals";
import tseslint from "typescript-eslint";

// 収録済みゲームのgameId。ゲームを追加したらここへ足す（07_リポジトリとツールチェーン.md 検査1・検査3）。
// 検査をゲームごとに複製せず、この一覧から規則を組む
const GAME_IDS = ["detectives", "dontsayit", "ranking", "whowrotethis"];

// ゲームモジュールのパッケージ名パターン（@beb/server-detectives 等）
// サブパス（@beb/client-dontsayit/guide 等）も対象にする。exportsで公開しているため経路が実在する
const GAME_MODULE_PATTERNS = GAME_IDS.flatMap((id) => [`@beb/*-${id}`, `@beb/*-${id}/*`]);

// gameIdリテラルの検出（07_リポジトリとツールチェーン.md 検査3）。registry.tsとclient/appにのみ許可する
const noGameIdLiteral = {
  selector: `Literal[value=/^(${GAME_IDS.join("|")})$/]`,
  message: "gameIdリテラルはregistry.tsとclient/appにのみ許可する（07_リポジトリとツールチェーン.md）",
};

// ゲームモジュールの動的importの検出。no-restricted-importsは動的import()を検出しないため補う（実測済み）
const noDynamicGameModuleImport = {
  selector: `ImportExpression[source.value=/^@beb\\/.*-(${GAME_IDS.join("|")})(\\/.*)?$/]`,
  message: "ゲームモジュールを動的importできるのはregistry.tsだけ（不変条件4、ADR-0009）",
};

// server/ が tools/ を参照しないことの機械的な担保（07「toolsがサーバ側パッケージに依存する件」）。
// 依存の向きは tools -> server の一方向で閉じる。逆流するとWorkerのバンドルにCI専用コードが入りうる
const noToolsImportPattern = {
  group: ["@beb/tools"],
  message: "server/ から tools/ を参照しない。依存の向きは tools -> server の一方向で閉じる（07）",
};

const noGameModuleImportPattern = {
  group: GAME_MODULE_PATTERNS,
  message: "server/core/ でゲームモジュールをimportできるのはregistry.tsだけ（不変条件4、ADR-0009）",
};

const noWsAccept = {
  selector: "CallExpression[callee.property.name='accept']",
  message: "ws.accept()は禁止。Hibernation APIのみ使用する（ADR-0002、CLAUDE.md不変条件6）",
};

// 検査5（07、ADR-0010）: on:/<slot>はコンパイラのrunesモードが警告のみでビルドを止めない（PR0で実測済み）。
// svelte/valid-compileはeslint-plugin-svelte 3.23.0の実装上、compilerOptions.runesをcompile()へ転送しないため
// 常に自動判定（rune未使用ファイルではlegacyモード）で動作し警告が出ない（実測済み）。AST選択子で直接検出して補う。
// .tsファイルのASTには該当ノードが存在しないため、svelte以外のファイルに含めても無害
const noOnDirective = {
  selector: "SvelteDirective[kind='EventHandler']",
  message: "on:イベントディレクティブは禁止。onclick等のプロパティ属性を使う（Svelte 5 runesモード、ADR-0010）",
};
const noSlotElement = {
  selector: "SvelteElement[name.name='slot']",
  message: "<slot>は禁止。{@render ...}を使う（Svelte 5 runesモード、ADR-0010）",
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/*.tsbuildinfo",
      "client/public/fonts/**",
      // wrangler typesによる生成物。手編集しない
      "server/core/worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    // 分割代入で不要なキーを捨てる際の慣用的な命名（例: `const { v: _v, ...rest } = raw`）を許可する
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  },
  {
    languageOptions: {
      globals: { ...globals.es2024 },
    },
  },
  {
    // eslint-plugin-svelteはrunesを使う.svelte.ts/.svelte.jsモジュール（ADR-0010）にもsvelteParserを
    // 適用する。script部分をTSとして解釈させるにはparserOptions.parserの委譲が.svelteファイルと同様に必要
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tseslint.parser,
      },
      globals: { ...globals.browser },
    },
  },
  {
    files: ["client/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["server/**/*.ts", "tools/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // ビルド時にNode.jsで実行するスクリプト（フォントサブセット生成等）
    files: ["**/scripts/**/*.mjs", "**/scripts/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // server/core/（registry.ts、テストコード以外）
  // 検査1: ゲームモジュールのimportはregistry.tsだけ（静的・動的とも。不変条件4、ADR-0009）
  // 検査3: gameIdリテラル禁止
  // 検査4: ws.accept()禁止（ADR-0002、CLAUDE.md不変条件6）
  {
    files: ["server/core/src/**/*.ts"],
    ignores: ["server/core/src/registry.ts", "server/core/src/**/*.test.ts", "server/core/src/test-support/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noGameModuleImportPattern, noToolsImportPattern] }],
      "no-restricted-syntax": ["error", noDynamicGameModuleImport, noGameIdLiteral, noWsAccept],
    },
  },
  // registry.tsはゲームモジュールのimportだけが許される。tools/への依存は他と同じく禁止する
  {
    files: ["server/core/src/registry.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noToolsImportPattern] }],
    },
  },
  // server/games/*（server/core・テストコード以外のserver/配下）
  // 検査3: gameIdリテラル禁止 / 検査4: ws.accept()禁止
  {
    files: ["server/**/*.ts"],
    ignores: ["server/core/src/**/*.ts", "server/**/*.test.ts", "server/**/test-support/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noToolsImportPattern] }],
      "no-restricted-syntax": ["error", noGameIdLiteral, noWsAccept],
    },
  },
  // server/**のテストコード: ws.accept()禁止はDurable Object側の実装(Hibernation API)の話であり、
  // テストヘルパーがクライアント側WebSocketPairで呼ぶ.accept()とは無関係のため対象外とする。
  // gameIdリテラル・動的import禁止はテストコードにも適用する
  {
    files: ["server/core/src/**/*.test.ts", "server/core/src/test-support/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noGameModuleImportPattern, noToolsImportPattern] }],
      "no-restricted-syntax": ["error", noDynamicGameModuleImport, noGameIdLiteral],
    },
  },
  // server/games/* のテストコード: 自分のパッケージが依存してよい@beb/shared-detectivesを使うため、
  // ゲームモジュールのimport禁止は課さない。tools/への逆流とgameIdリテラルのみ禁止する
  {
    files: ["server/games/**/*.test.ts", "server/games/**/test-support/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noToolsImportPattern] }],
      "no-restricted-syntax": ["error", noGameIdLiteral],
    },
  },
  // shared/core/ client/core/: ゲームモジュールをimportしない（検査2、静的・動的とも）+ 検査3 + 検査5
  {
    files: ["shared/core/src/**/*.ts", "client/core/src/**/*.{ts,svelte}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...GAME_MODULE_PATTERNS, "**/games/**"],
              message: "共通コアはゲームモジュールをimportしない（不変条件4）",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        noDynamicGameModuleImport,
        noGameIdLiteral,
        noOnDirective,
        noSlotElement,
      ],
    },
  },
  // shared/games/*, shared/engine/*, tools/*: 検査3のみ（svelteファイルを持たないため検査5は対象外）
  {
    files: ["shared/games/**/*.ts", "shared/engine/**/*.ts", "tools/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", noGameIdLiteral],
    },
  },
  // shared/engine/: 汎用推論エンジンはどのパッケージにも依存しない（ADR-0014）。
  // ゲーム固有の語彙が混入していないことは、検査3に加えて@beb/*のimport禁止で機械的に担保する
  {
    files: ["shared/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@beb/*"],
              message: "推論エンジンは他パッケージに依存しない（ADR-0014、07のパッケージ表）",
            },
          ],
        },
      ],
    },
  },
  // client/games/*: 検査3 + 検査5
  {
    files: ["client/games/**/*.{ts,svelte}"],
    rules: {
      "no-restricted-syntax": ["error", noGameIdLiteral, noOnDirective, noSlotElement],
    },
  },
  // client/app: gameIdリテラルを許可する唯一のクライアント側パッケージ。検査5のみ適用
  {
    files: ["client/app/**/*.{ts,svelte}"],
    rules: {
      "no-restricted-syntax": ["error", noOnDirective, noSlotElement],
    },
  },
);
