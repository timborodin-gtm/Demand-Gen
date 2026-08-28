# Source & Attribution

Vendored from **https://github.com/AgriciDaniel/claude-ads**
License: **MIT**
Copied: 2026-08-28, at upstream commit `669c760`

## What it is
Claude-first paid-media operations skill across **12 ad platforms** (Google, Meta,
YouTube, LinkedIn, TikTok, Microsoft, Apple, Amazon, Reddit, Pinterest, Snapchat, X).
Source-grounded audits, deterministic scoring, versioned JSON reports, and
capability-gated account changes. **8,556★** — the most-adopted project in this repo.
Read-only by default; live changes stay disabled behind approval, idempotency,
verification, audit and rollback gates.

## Modifications from upstream
- `.github/` removed. Upstream ships `ci.yml` (on push/PR to main) and
  `dependabot-automerge.yml` (on pull_request). Kept here, both would run in this
  repository — the auto-merge one is especially undesirable in someone else's repo.
- No other files changed.
