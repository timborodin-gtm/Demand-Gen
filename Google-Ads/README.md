# Google Ads

Vendored Google Ads tooling. Each subfolder keeps its upstream `LICENSE` and a
`SOURCE.md` recording where it came from, at which commit, and any modifications.

| Subfolder | Source | License | What it is |
|---|---|---|---|
| [`Pmax-Search-Terms/`](Pmax-Search-Terms/) | [siliconvallaeys](https://github.com/siliconvallaeys/Pmax-Search-Terms) | MIT | Google Ads Script exporting Performance Max search terms to a Sheet, with a PMax/Search cannibalization column. |
| [`google-ads-analyzer/`](google-ads-analyzer/) | [mathiaschu](https://github.com/mathiaschu/google-ads-analyzer) | MIT | Claude Code skill + 12 reference docs (GAQL, Quality Score, Smart Bidding, PMax, negatives, impression share). ⚠️ Paired MCP server has spend-affecting write tools. |
| [`google-ads-mcp/`](google-ads-mcp/) | [googleads](https://github.com/googleads/google-ads-mcp) | Apache 2.0 | Google's **official** Google Ads MCP server. Read-only by design. |
| [`googleads-python-lib/`](googleads-python-lib/) | [googleads](https://github.com/googleads/googleads-python-lib) | Apache 2.0 | ⚠️ **Google Ad Manager SOAP** library — publisher side, *not* advertiser-side Google Ads. For that use [google-ads-python](https://github.com/googleads/google-ads-python). |

## Notes
- `.github/` workflows were stripped from `google-ads-mcp` so upstream CI does not
  run in this repository. Recorded in that folder's `SOURCE.md`.
- Nothing here is maintained by this repo — use upstream for issues or updates.
