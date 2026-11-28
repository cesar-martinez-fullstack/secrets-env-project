# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/). Releases are annotated `vX.Y.Z` tags on
`main`; see [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md).

Before `1.0.0`, a minor release may change the on-disk format or configuration. Such changes are
listed under **Changed** with upgrade notes — back up your vault before upgrading.

## [Unreleased]

## [0.4.0] - 2026-11-28

Version 0.3.0 was never published (it has no tag or release), so this one includes everything since 0.2.0.

**Before upgrading, back up your vault** (Settings > Backup, or `./scripts/update.sh`, which takes one for
you). The first start upgrades the database automatically (schema v6 to v8). **There is no way back:** 0.2.0
cannot open an upgraded database; to return to it you need a backup made before upgrading.

### Added

- Import Postman Environment and Globals files, and the variables of a v2.1 collection, with a preview.
  They can go into a new environment or the current one. Empty and disabled variables are skipped, and the
  preview says how many.
- Move an environment, with its secrets, to another project.
- View secrets as a list, as cards or in a compact view; the choice is remembered.
- Edit the idle lock (5, 15, 30 or 60 minutes) and the maximum session length (1, 4, 8 or 12 hours) from
  Settings, with the master password. Shortening a limit also applies to open sessions.
- Structured server log: one JSON line per request with the generic route, status and duration, never
  bodies, searches, names, values or passwords. Its level can be changed from Settings with the master
  password, or with `SV_LOG_LEVEL` (`info` by default). In Docker the log rotates (3 files of 10 MB).

### Changed

- After copying a secret or the recovery key, the app now tries to empty the clipboard after 30 seconds
  (60 seconds or off can be chosen) and when the vault is locked. This is not a guaranteed erase: it does not
  reach the system clipboard history, the browser may delay it until the window has focus, it does not happen
  if the tab is closed first, and it can clear something you copied afterwards in another program.
- Values saved from Settings take precedence over `SV_AUTO_LOCK_MINUTES`, `SV_SESSION_MAX_HOURS` and
  `SV_LOG_LEVEL`. Until you save them, the environment keeps ruling, so upgrading keeps your timings.
- The secret list shows 50 per page, sorted by the server. Manual order still shows the whole environment,
  and "select all" covers only the visible page. `GET /api/secrets` accepts `limit`, `offset` and
  `order` and returns the total in `X-Total-Count`; without `limit` it still returns everything.

### Fixed

- Dialogs taller than the window, such as Settings, kept their title and close button out of reach.
- The start-up message showed the idle lock from the environment instead of the one in effect.

### Security

- Unexpected server errors are no longer printed in full: only their type and where they happened are
  logged, because the message could quote data that had been sent.
- The API now refuses any request the browser marks as started by another site, reads included: another page
  could navigate to the plaintext export and leave the file in your downloads.
- Nothing can be encrypted with a wiped key. If the vault locked while a request was still arriving, a value
  could be stored encrypted with zeros and reported as saved.
- Audit events are pruned per kind, so repeating settings changes can no longer push out the record that the
  history was cleared. Saving without changing anything no longer records an event.
- Copying a revealed secret or the recovery key by hand also schedules the clipboard cleaning, and the
  clipboard is cleared when the vault locks on its own.

## [0.2.0] - 2026-11-25

Upgrading from 0.1.0 migrates the database automatically and in a transaction (schema v6). Back up your
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
- Share or export only the secrets you select.
- Download a backup of the whole vault from Settings, after typing the master password again. Values and
  notes stay encrypted inside the file; project, environment and secret names and the audit history do not.
- Choose how many audit events are kept (500, 1,000, 5,000 or 10,000) or clear the history from Settings,
  both with the master password. Clearing it always leaves an event saying so.
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

- The database schema moves from v1 to v6: projects, "imported" mark, manual order and audit retention.
  Migrations are automatic; the vault cannot be opened by an older version afterwards.
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
- Backup, audit retention and history clearing ask for the master password again and share one attempt
  budget with password and recovery key changes. Failed confirmations are recorded in the audit history.
- Failed attempts and changes to the audit history are retained apart from other events, so they cannot be
  pushed out by generating more events. With an unlocked session, ordinary events can still displace older
  ordinary ones.
- For attempt limits, every loopback address counts as the same client.

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

[Unreleased]: https://github.com/cesar-martinez-fullstack/secrets-env-project/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/cesar-martinez-fullstack/secrets-env-project/compare/v0.2.0...v0.4.0
[0.2.0]: https://github.com/cesar-martinez-fullstack/secrets-env-project/releases/tag/v0.2.0
