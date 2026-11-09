// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      '**/node_modules/**',
      '**/dist/**',
      '**/public/**',
      '**/*.vue',
      'apps/api/public/**',
      'lint-staged.config.js',
      'lint-staged.config.mjs', // JS plano de tooling: lo formatea prettier
      '.claude/**', // hooks de Claude: scripts Node CommonJS autocontenidos
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
      // Monorepo: projectService resuelve el tsconfig más cercano a cada archivo.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── Reglas para código de producción ──────────────────────────────────────
  {
    ignores: ['**/tests/**', '**/*.spec.ts'],
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // Complejidad y tamaño — Clean Code
      'max-params': ['warn', 3],
      'max-lines-per-function': ['warn', { max: 30, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 8],
      'max-depth': ['warn', 3],

      // Los puertos (ports/) definen métodos async por contrato: implementaciones
      // síncronas válidas dispararían falsos positivos.
      '@typescript-eslint/require-await': 'off',

      // Unused vars — permite prefijo _ para parámetros intencionalmente sin uso
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Calidad
      'no-console': 'warn',
      'no-duplicate-imports': 'off',
      'prefer-const': 'error',

      // Formato
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },

  // ── Reglas para archivos de test (más permisivas) ─────────────────────────
  {
    files: ['**/tests/**', '**/*.spec.ts'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      'max-params': 'off',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      // Los typings de bun:test (jest.fn) no dan para typed-linting:
      // se desactivan las reglas que exigen informacion de tipos en tests.
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },

  // ── Infraestructura y casos de uso — constructores DI con varias deps ─────
  {
    files: [
      '**/routes/**',
      '**/container.ts',
      '**/*-service.ts',
      '**/app.ts',
      '**/index.ts',
      '**/static.ts',
    ],
    rules: {
      'max-params': ['warn', 6],
    },
  },
);
