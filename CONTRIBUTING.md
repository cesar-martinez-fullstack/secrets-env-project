# Contributing to SecretVault

Thanks for your interest! SecretVault is a security-sensitive project, so changes are held to
a high bar for tests and clarity. Small, focused pull requests are the easiest to review.

By contributing you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md) and that your
contributions are licensed under the [MIT License](LICENSE).

## Reporting issues

- **Bugs and ideas:** open an issue using the templates.
- **Security vulnerabilities:** do **not** open a public issue. Follow [SECURITY.md](SECURITY.md).

## Development setup

Requires [Bun](https://bun.sh) ≥ 1.4 and (optionally) Docker.

```bash
git clone https://github.com/cesar-martinez-fullstack/secrets-env-project.git
cd secrets-env-project
bun install            # also installs the Git hooks (Husky)
bun run dev            # http://localhost:5173
```

Never use real secrets in tests or fixtures. The `data/` folder and `.env` are git-ignored.

## Workflow (Git Flow)

Full details in [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md). In short:

1. Fork, then branch from **`develop`**: `feature/<short-name>` or `fix/<short-name>`.
2. Make small commits using **Conventional Commits in English**:
   `type(scope): short description` — subject ≤ 72 chars, lowercase, imperative.
3. Open a Pull Request against **`develop`**. Fill in the template.

## Pull request size

Prefer one PR per vertical slice: a user-visible behaviour delivered end to end (UI, API, data and
tests). It should be reviewable in one sitting (roughly under 400 diff lines, excluding lockfiles) and
use 1 to 5 coherent commits that each leave the repository green.

## Before you open a PR

```bash
bun test && bun run typecheck && bun run lint:check
bun run test:architecture && bun run test:security
```

All must pass. Expectations:

- **Tests.** New behaviour needs tests; a bug fix starts with a test that reproduces it.
  Security controls need a test that fails if the control is removed.
- **Architecture.** Respect the layer rules (`core` has no framework imports; only
  `apps/api/src/container.ts` wires adapters). `tests/architecture.spec.ts` enforces them.
- **Data.** Schema changes are new migrations — never edit an applied one. Multi-row writes go
  through the `UnitOfWork`. Changing the encryption format needs a migration plan.
- **Security.** Touching auth, crypto, sessions, routes, config or Docker? Walk through the
  checklist in `.claude/skills/owasp-security-review/SKILL.md` and mention the result in the PR.
- **No new runtime dependencies** without a clear reason; the dependency surface is part of the
  security model.
- **Docs.** Update `README`, `docs/` and the changelog entry notes when behaviour changes.

## Commit message examples

```text
feat(api): add export format registry
fix(crypto): reject truncated ciphertext blobs
docs: clarify the threat model
test(database): cover migration rollback
```

Hooks validate this locally (commitlint). Please do not bypass them with `--no-verify`.

## Releases

Maintainers cut releases from `release/*` branches and tag `vX.Y.Z` on `main`. You don't need to
edit the changelog in your PR — it is assembled from commit messages, which is one more reason
to write good ones.
