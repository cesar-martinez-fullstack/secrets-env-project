# Git workflow — Git Flow

SecretVault uses **Git Flow** with Conventional Commits and Semantic Versioning.
Releases are **annotated tags** (`vX.Y.Z`) created on `main`.

## Branches

| Branch          | Purpose                                         | Created from | Merges into              | Lifetime  |
| --------------- | ----------------------------------------------- | ------------ | ------------------------ | --------- |
| `main`          | Production. Every commit is a release or hotfix | —            | —                        | permanent |
| `develop`       | Integration of the next release                 | `main`       | —                        | permanent |
| `feature/*`     | New functionality                               | `develop`    | `develop`                | short     |
| `fix/*`         | Non-urgent bug fix                              | `develop`    | `develop`                | short     |
| `release/X.Y.Z` | Release hardening (version, changelog, QA)      | `develop`    | `main` **and** `develop` | days      |
| `hotfix/X.Y.Z`  | Urgent fix of a released version                | `main`       | `main` **and** `develop` | hours     |

Other prefixes follow the Conventional Commit types and behave like `feature/*`
(branch from `develop`, merge into `develop`): `chore/`, `docs/`, `refactor/`,
`test/`, `perf/`, `ci/`, `build/`, `security/`.

Branch names: lowercase, kebab-case, short — `feature/export-strategy`, `fix/csv-quoting`.

```text
main     ●───────────────────●─────────●──────────────  (tags: v0.1.0 ... v0.2.0 ... v0.2.1)
          \                 / \       /
develop    ●──●─────●──●───●───●─────●──●───────────────
              \   /     \ /
feature/x      ●─●       ●   (merge with --no-ff via Pull Request)
```

## Day-to-day (feature / fix)

```bash
git switch develop && git pull
git switch -c feature/export-strategy
# ...1 to 5 coherent commits, each leaving the repo green...
git push -u origin feature/export-strategy
# open a Pull Request  feature/export-strategy -> develop
```

- Pull Requests target **`develop`** (never `main`, except `release/*` and `hotfix/*`).
- One PR is one vertical slice (or one coherent change), reviewable in a single sitting: roughly under 400
  diff lines excluding lockfiles and generated files. Larger work is split by slice, never by layer.
- 1 to 5 commits per PR; each one builds and passes the checks. No WIP, no commit per file or per layer.
- CI must be green; review the checklist in the PR template.
- Merge with a **merge commit** (`--no-ff`): the branch history stays visible.
- Delete the branch after merging.

## Releasing

1. Branch off `develop`: `git switch -c release/0.2.0`.
2. Bump `version` in the root `package.json`, update `CHANGELOG.md` (see below). Only release
   fixes land on this branch — no new features.
3. Run the full checks: `bun test && bun run typecheck && bun run lint:check && bun audit`.
4. Open a PR `release/0.2.0 -> main`. After merge, tag **on `main`**:
   ```bash
   git switch main && git pull
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```
5. Merge `main` back into `develop` so the release commit and changelog are not lost.
6. The tag triggers the release workflow (GitHub Release, binaries, container image).

The `cut-release` skill (`.claude/skills/cut-release`) automates the version calculation and
changelog draft. Nothing is tagged or pushed without explicit confirmation.

## Hotfix

```bash
git switch main && git pull
git switch -c hotfix/0.2.1
# fix + test, bump patch version, update CHANGELOG
# PR -> main, tag v0.2.1 on main, then merge main back into develop
```

## Versioning (SemVer)

| Commits in the range                      | Bump              |
| ----------------------------------------- | ----------------- |
| `fix`, `perf` (user-visible)              | patch             |
| `feat`                                    | minor             |
| `BREAKING CHANGE:` footer or `type!:`     | major             |
| `chore`, `docs`, `test`, `ci`, `build`, … | none on their own |

The highest bump in the range wins. **Before `1.0.0`**, minor releases may change the on-disk
format or configuration; this is always called out in the changelog.

A change to the **encrypted data format** (cipher, AAD, KDF) is always at least a minor bump
and needs a data-migration plan (see `.claude/skills/db-migration`).

## Commit messages (Conventional Commits, English, short)

```text
type(scope): short description in lowercase
```

- Subject **≤ 72 characters**, imperative mood, no trailing period, **lowercase**.
- Body is optional and short (wrap at 72). Explain _why_, not _what_.
- Types: `feat` `fix` `chore` `docs` `refactor` `test` `style` `perf` `ci` `build`.
- Scopes (optional): `shared` `core` `crypto` `database` `api` `web` `docker` `deps` `release`.
- One logical change per commit. No emojis. No generated-by or co-author trailers.
- Never `--no-verify`.

```text
feat(api): add host and origin guards
fix(database): roll back failed password rotation
docs: describe the git flow
chore(release): 0.2.0
```

Validated locally by commitlint (Husky `commit-msg`) and again in CI.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com): sections
`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Entries describe the effect
for users in plain language, not internal class names. It is written when cutting a release,
from the Conventional Commits since the previous tag.

## Recommended GitHub settings

- Keep **`main`** as the default branch so visitors see the latest release; contributors open
  pull requests against `develop`.
- Protect `main` and `develop`: require a pull request, require the CI check, block force pushes
  and deletions.
- Enable "Automatically delete head branches" and private vulnerability reporting.
