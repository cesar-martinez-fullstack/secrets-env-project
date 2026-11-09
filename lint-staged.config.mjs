/** @type {import('lint-staged').Config} */
export default {
  // Type check del monorepo completo en cada commit (rápido: ~2s con Bun)
  '**/*.ts': () => 'bun run typecheck',

  // Lint + fix de los TypeScript en staging
  '**/*.{ts,mts,cts}': ['eslint --fix'],

  // Formato de código y docs
  '**/*.{ts,mts,cts,vue,json,md,css,html}': ['prettier --write'],
};
