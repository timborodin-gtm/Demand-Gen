# Source & Attribution

Vendored from **https://github.com/mathiaschu/google-ads-analyzer**
Author: mathiaschu
License: **MIT** — see `LICENSE`. Reuse permitted with attribution.
Copied: 2026-08-28, at upstream commit `9ae39c2` (61★, last pushed 2026-03-10)

## What it is
A Claude Code **skill + MCP setup** for Google Ads analysis:
- `skill/SKILL.md` plus **12 reference docs** — GAQL queries, Quality Score,
  Smart Bidding, Performance Max, search terms & negatives, impression share,
  conversion tracking, account structure, RSA copy, segmentation,
  performance fluctuations, core concepts.
- `mcp/mcp.json.example` and `scripts/oauth_client.json.example` — config
  templates only, no credentials.

## ⚠️ It includes WRITE tools
The paired MCP server exposes 6 write operations against a live Google Ads
account: add negative keywords, pause/enable campaigns & ad groups & ads,
update daily budgets, change bidding strategies. **These change spend.**
Treat granting it OAuth as a spend decision, not a tooling one.

## Note
The MCP **server** is a separate repo (`mathiaschu/google-ads-mcp`, a fork of
Google's) and is **not** vendored here — this folder is the skill and config
templates only. Compare with `../google-ads-mcp/`, which is Google's official
read-only server.

## Modifications from upstream
None. Copied verbatim; upstream ships no `.github/` workflows.
