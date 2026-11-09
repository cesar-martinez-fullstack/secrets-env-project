## What and why

<!-- What does this change do, and why is it needed? Link the issue: Closes #123 -->

## Type of change

- [ ] feat — new functionality
- [ ] fix — bug fix
- [ ] refactor / perf / test / docs / ci / build / chore
- [ ] Breaking change (`!` in the commit type or `BREAKING CHANGE:` footer)

## Checklist

- [ ] Branch is based on `develop` and this PR targets `develop` (`release/*` and `hotfix/*` target `main`)
- [ ] Commits follow Conventional Commits (English, lowercase, subject ≤ 72 chars)
- [ ] `bun test`, `bun run typecheck` and `bun run lint:check` pass
- [ ] New behaviour has tests (a bug fix includes a test that reproduces it)
- [ ] Layer rules respected (`bun run test:architecture`)
- [ ] Docs updated if behaviour or configuration changed

## Security review (auth, crypto, sessions, routes, config, Docker, dependencies)

- [ ] Not applicable
- [ ] Reviewed against the OWASP checklist (`.claude/skills/owasp-security-review`) — no findings / findings listed below

<!-- Never paste real secrets, vault files or `.env` contents. -->
