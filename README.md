# Demand Gen

A working collection of demand-generation tooling and creative, organized by channel.
Part original work, part a curated library of open-source tooling for paid media,
SEO/AEO and ABM.

Maintained by **Tim Borodin** — demand gen & growth marketing.

---

## What's here

| Folder | Contents |
|---|---|
| [`ABM/`](ABM/) | Display banner wireframes and a landing page builder, plus [`ABM-Ads/`](ABM/ABM-Ads/) — multi-platform paid-media tooling. |
| [`AEO-SEO/`](AEO-SEO/) | Content intelligence app and a keyword-mapping / opportunity-sizing skill. |
| [`Google-Ads/`](Google-Ads/) | PMax search-terms script, an analysis skill with 12 reference docs, Google's official MCP server, and the Ad Manager SOAP library. |
| [`LinkedIn-Ads/`](LinkedIn-Ads/) | Four LinkedIn Ads projects: audit kit, MCP server, ads skill, and a Cowork plugin. |

Each channel folder has its own README with a per-project index.

---

## Original work

- **`ABM/banner-builder.html`** — StackAdapt ABM display banner wireframes: strongest
  selected copy across 6 ad sizes (728×90, 300×600, 300×250, 480×320, 320×50, 160×600)
  for 21 WMS menu pages, each with ICP pain, page takeaway and evidence basis.
- **`ABM/landing-page-builder.html`** — a WMS landing page built for 3PLs and
  high-volume brands, feature-ordered by what matters most to that buyer.

---

## ⚠️ On the vendored projects

Everything outside the two HTML builders is **third-party open-source code, vendored
for reference**. None of it is maintained here — use the upstream repository for
issues, updates or contributions.

Every vendored folder contains:
- its upstream **`LICENSE`** (where one exists), and
- a **`SOURCE.md`** recording the source URL, author, license, the exact upstream
  commit it was copied at, and any modifications made.

**Licensing is not uniform. Check before you reuse anything:**

| License | Projects | What it means |
|---|---|---|
| MIT / Apache 2.0 | most | Free to use and modify with attribution. |
| **MIT + Commons Clause** | `ads-skills`, `linkedin-ads-skill` | You may **not sell** it — and "sell" explicitly covers consulting or support services whose value derives substantially from the software. |
| **No license** | `linkedin-ads-manager-plugin`, `keyword-mapping`, `content-intelligence` | All rights reserved by default. Reference only — ask the author before reusing. |

**Two safety notes:**
- Several projects expose **write** operations against live ad accounts — pausing
  campaigns, changing budgets and bidding strategies. Granting one OAuth access is a
  spend decision, not just a tooling one. Google's `google-ads-mcp` is read-only by
  design and the safest starting point.
- CI workflows were stripped from `claude-ads` and `google-ads-mcp` so upstream
  automation (including a dependabot auto-merge) does not run in this repository.
  Recorded in each `SOURCE.md`.

No credentials are committed anywhere here — `.env.example` files hold placeholders only.
