# Source & Attribution

Vendored from **https://github.com/googleads/google-ads-mcp**
Author: Google (googleads)
License: **Apache License 2.0** — see `LICENSE`. Redistribution permitted with
attribution and retention of the license.
Copied: 2026-08-28, at upstream commit `88f0467`

## What it is
Google's **official** Google Ads MCP server — connects Google Ads to MCP clients
(Claude, etc.) for diagnostics and analytics. Read-only by design: it cannot
change bids, pause campaigns, or create assets.

## Modifications from upstream (per Apache 2.0 §4b)
- `.github/` removed. Upstream ships `ci.yml` triggered on `push` and
  `pull_request` to `main`; kept here it would run on every push to this
  repository and fail for lack of the upstream test setup.
- No other files changed.

To run or contribute, use the upstream repository rather than this copy.
