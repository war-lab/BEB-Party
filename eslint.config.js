// @ts-check
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";
import globals from "globals";
import tseslint from "typescript-eslint";

// 'detectives'リテラルの検出（07_リポジトリとツールチェーン.md 検査3）。registry.tsとclient/appにのみ許可する
const noDetectivesLiteral = {
  selector: "Literal[value='detectives']",
  message: "'detectives'リテラルはregistry.tsとclient/appにのみ許可する（07_リポジトリとツールチェーン.md）",
};

// @beb/*-detectivesの動的importの検出。no-restricted-importsは動的import()を検出しないため補う（実測済み）
const noDynamicDetectivesImport = {
  selector: "ImportExpression[source.value=/^@beb\\/.*-detectives$/]",
  message: "ゲームモジュールを動的importできるのはregistry.tsだけ（不変条件4、ADR-0009）",
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
    files: ["**/*.svelte"],
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
  // server/core/（registry.ts以外）
  // 検査1: @beb/*-detectivesのimportはregistry.tsだけ（静的・動的とも。不変条件4、ADR-0009）
  // 検査3: 'detectives'リテラル禁止
  // 検査4: ws.accept()禁止（ADR-0002、CLAUDE.md不変条件6）
  {
    files: ["server/core/src/**/*.ts"],
    ignores: ["server/core/src/registry.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@beb/*-detectives"],
              message: "server/core/ でゲームモジュールをimportできるのはregistry.tsだけ（不変条件4、ADR-0009）",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", noDynamicDetectivesImport, noDetectivesLiteral, noWsAccept],
    },
  },
  // server/games/*（server/core以外のserver/配下）
  // 検査3: 'detectives'リテラル禁止 / 検査4: ws.accept()禁止
  {
    files: ["server/**/*.ts"],
    ignores: ["server/core/src/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", noDetectivesLiteral, noWsAccept],
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
              group: ["@beb/*-detectives", "**/games/**"],
              message: "共通コアはゲームモジュールをimportしない（不変条件4）",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        noDynamicDetectivesImport,
        noDetectivesLiteral,
        noOnDirective,
        noSlotElement,
      ],
    },
  },
  // shared/games/*, tools/*: 検査3のみ（svelteファイルを持たないため検査5は対象外）
  {
    files: ["shared/games/**/*.ts", "tools/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", noDetectivesLiteral],
    },
  },
  // client/games/*: 検査3 + 検査5
  {
    files: ["client/games/**/*.{ts,svelte}"],
    rules: {
      "no-restricted-syntax": ["error", noDetectivesLiteral, noOnDirective, noSlotElement],
    },
  },
  // client/app: 'detectives'リテラルを許可する唯一のクライアント側パッケージ。検査5のみ適用
  {
    files: ["client/app/**/*.{ts,svelte}"],
    rules: {
      "no-restricted-syntax": ["error", noOnDirective, noSlotElement],
    },
  },
);
