# Security Policy

SecretVault stores sensitive data, so vulnerability reports are taken seriously.

## Supported versions

Only the **latest released version** receives security fixes. Before `1.0.0` that means the
most recent `0.x` release.

## Reporting a vulnerability

**Please do not open a public issue or pull request for security problems.**

Use GitHub's private reporting:

1. Go to the **Security** tab of the repository.
2. Choose **Report a vulnerability** and describe the problem.

Helpful details: affected version, steps to reproduce, impact, and (if you have one) a proposed fix.
Never include real secrets in a report.

You can expect:

- an acknowledgement within **7 days**;
- an assessment and a plan within **14 days**;
- credit in the release notes if you wish, once a fix is released.

This is a volunteer-maintained project, so timelines are best effort.

## Scope

In scope: confidentiality and integrity of the vault (cryptography, key handling, sessions,
authentication, access from other hosts or origins), injection, path traversal, unsafe defaults,
container hardening, and the supply chain (dependencies, build and release workflows).

Out of scope: attacks that require an already-compromised machine or an unlocked, unattended
session; loss of the master password (it is unrecoverable by design); and denial of service
against a service that only listens on loopback.

## Design notes

The threat model, assumptions and known limitations are documented in
[docs/SECURITY.md](docs/SECURITY.md). SecretVault has **not** been independently audited.
