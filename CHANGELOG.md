# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/). Releases are annotated `vX.Y.Z` tags on
`main`; see [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md).

Before `1.0.0`, a minor release may change the on-disk format or configuration. Such changes are
listed under **Changed** with upgrade notes — back up your vault before upgrading.

## [Unreleased]

## [0.1.0] - 2026-11-09

First public release.

### Added

- Local vault protected by a master password, with first-run setup, manual lock and automatic
  lock after inactivity.
- Environments (`Local`, `QA`, `Production`, …) with per-environment secret counts.
- Secrets with optional notes. Values are masked in every listing and only leave the server
  through an audited reveal.
- Instant, case-insensitive search by variable name across all environments.
- Bulk import from pasted `.env` content (comments, quotes and `export` supported) with a preview.
- Export per environment as `.env`, CSV or a printable PDF.
- Local audit log of setup, unlock, failed unlock, lock, reveal, export, import and password
  rotation events — never including secret values.
- Recovery key: a 256-bit key shown once at setup (and again when regenerated) lets you regain access
  if you forget the master password. Using it sets a new password and issues a new recovery key; you
  can also regenerate it from the new Security panel, where you can change the master password too.
- Vaults created by earlier development builds are upgraded automatically on their next unlock and
  receive their recovery key at that moment; no secret is re-encrypted.
- Random secret generator, light/dark/system theme.
- Single-container Docker deployment with a persistent volume, and a self-contained binary build.

### Security

- Secrets encrypted with AES-256-GCM under a random data key that is wrapped twice (by the master
  password via PBKDF2-HMAC-SHA256 with 600,000 iterations, and by the recovery key via HKDF). The data
  key lives only in memory and is zeroed when the vault locks. Changing the password only re-wraps it.
- The recovery endpoint is rate limited, audited and never logs or stores the key.
- Each ciphertext is bound to its environment and secret name, so it cannot be moved between
  secrets without detection.
- Reachable from the local machine only: listens on `127.0.0.1`, Docker publishes the port on
  loopback, and requests with an unexpected `Host` or `Origin` are rejected.
- Strict Content Security Policy, anti-framing and other security headers.
- Rate limiting on unlock, setup and password change; session cookies are `HttpOnly` and
  `SameSite=Lax`, with sliding and absolute expiry.
- SQLite with versioned migrations, `CHECK` constraints, atomic transactions, full durability
  (`synchronous=FULL`) and secure deletion.
- Container runs as a non-root user from pinned base images.

[Unreleased]: https://github.com/cesar-martinez-fullstack/secrets-env-project/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cesar-martinez-fullstack/secrets-env-project/releases/tag/v0.1.0
