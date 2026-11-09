import type { UserConfig } from '@commitlint/types';

/**
 * Conventional Commits enforced by the Husky `commit-msg` hook and again in CI.
 *
 * Format: type(scope): short description in English (lowercase, max 72 chars)
 * Short by design: the body is optional and wrapped at 72 columns.
 */
const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        // Project policy: no authorship/attribution trailers from tools or assistants.
        'no-ai-attribution': ({ raw }) => {
          const forbidden = /co-authored-by:|generated (with|by)|\bclaude\b|\banthropic\b/i;
          return [
            !forbidden.test(raw ?? ''),
            'commit message must not contain co-author or tool/AI attribution',
          ];
        },
      },
    },
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'style', 'perf', 'ci', 'build'],
    ],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 72],
    'footer-max-line-length': [2, 'always', 72],
    'no-ai-attribution': [2, 'always'],
  },
};

export default config;
