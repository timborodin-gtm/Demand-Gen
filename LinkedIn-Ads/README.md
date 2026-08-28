# LinkedIn Ads

Vendored LinkedIn Ads tooling. Each subfolder keeps its upstream `LICENSE` (where one
exists) and a `SOURCE.md` recording origin, commit and modifications.

| Subfolder | Source | ★ | License | What it is |
|---|---|---:|---|---|
| [`linkedin-ads-kit/`](linkedin-ads-kit/) | [TheMattBerman](https://github.com/TheMattBerman/linkedin-ads-kit) | 17 | MIT | Buyer-quality audits, safe drafts, API-backed briefs, Thought Leader Ads workflows. |
| [`linkedin-ads-mcp/`](linkedin-ads-mcp/) | [danielpopamd](https://github.com/danielpopamd/linkedin-ads-mcp) | 29 | MIT | MCP server, 25 tools: accounts, campaigns, creatives, audiences, conversions, analytics. |
| [`linkedin-ads-skill/`](linkedin-ads-skill/) | [ivangfalco](https://github.com/ivangfalco/linkedin-ads-skill) | 8 | ⚠️ MIT + Commons Clause | Reporting, campaign/ad creation, bulk edits, creative generation. |
| [`linkedin-ads-manager-plugin/`](linkedin-ads-manager-plugin/) | [twentworth12](https://github.com/twentworth12/linkedin-ads-manager-plugin) | 11 | ⚠️ **None** | Claude Cowork plugin for managing LinkedIn ad campaigns. |

## ⚠️ Before using any of these
- **Commons Clause** (`linkedin-ads-skill`) forbids *selling* — including consulting or
  support services whose value derives substantially from the software.
- **No license** (`linkedin-ads-manager-plugin`) means all rights reserved by default.
  Reference only.
- Several expose **write** operations against live ad accounts. Granting OAuth is a
  spend decision, not just a tooling one.
- Every `.env.example` here holds placeholders only — no credentials were vendored.
