# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/). Releases are annotated `vX.Y.Z` tags on
`main`; see [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md).

Before `1.0.0`, a minor release may change the on-disk format or configuration. Such changes are
listed under **Changed** with upgrade notes — back up your vault before upgrading.

## [Unreleased]

## [0.2.0] - 2026-11-24

Upgrading from 0.1.0 migrates the database automatically and in a transaction (schema v5). Back up your
vault before upgrading (from this version on, `./scripts/update.sh` takes a backup for you).

### Added

- Projects: environments are grouped into projects, with create, rename and delete for empty projects.
- Sharing: export a project or an environment as an encrypted `.svshare` file protected by a passphrase
  (at least 12 characters) and import it as a new project or merge it into an existing one, choosing for
  each repeated environment whether to merge or keep it apart, and whether to skip or overwrite variables.
  Received secrets are marked "Imported" until their value is edited.
- Import variables from `.env`/TXT, CSV and JSON files (the same formats the app exports) with a preview,
  notes included. JSON is shown formatted and syntax highlighted.
- Export an environment as JSON and as a Postman Environment (every variable as `secret`).
- Select several secrets and delete them at once (atomic, with a confirmation that lists the names).
- Sort secrets A to Z or Z to A, or manually per environment with drag and drop or up and down buttons.
- Personalization: application name, logo, accent color and default theme, with a live preview in Settings.
- First-run wizard and guided tour, which can be replayed from Settings.
- Spanish and English interface.
- "Check for updates" button in Settings. It only connects to GitHub when pressed, sends no data and never
  installs anything. It is the only outbound request the app makes; set `SV_UPDATE_CHECK=false` to disable
  it (see ADR-0010).
- Docker image published for `linux/amd64` and `linux/arm64` (Apple Silicon Macs), `scripts/update.sh` to
  update from `main` keeping the data and taking a backup first, and a macOS installation guide
  (`docs/MAC.md`).

### Changed

- The database schema moves from v1 to v5: projects, "imported" mark and manual order. Migrations are
  automatic; the vault cannot be opened by an older version afterwards.
- Instance settings (name, logo, accent, theme) are stored in `settings.json` inside the data directory,
  outside the vault, so they can be shown before unlocking.

### Fixed

- `.dockerignore` now excludes every `node_modules` and `dist` directory, so building the image on a machine
  where `bun install` was already run no longer breaks.

### Security

- Logo uploads accept only PNG, JPEG and WebP, validated by content (never SVG), up to 256 KB.
- Shared files use PBKDF2 and AES-256-GCM with authenticated data, and a generic error for a wrong passphrase
  or a damaged file.
- Bulk and manual-order operations are atomic and validate that the ids belong to the environment.

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

[Unreleased]: https://github.com/cesar-martinez-fullstack/secrets-env-project/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/cesar-martinez-fullstack/secrets-env-project/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/cesar-martinez-fullstack/secrets-env-project/releases/tag/v0.1.0
