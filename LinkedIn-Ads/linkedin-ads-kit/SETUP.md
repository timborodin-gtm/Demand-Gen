# Setup

## 1. Install

Fast path:

```bash
./install.sh
```

Named brand fast path:

```bash
./install.sh --brand acme
```

Manual path:

```bash
npm install
```

## 2. Create Brand Memory

Named brand setup (recommended — matches `npm run demo` and scales to multiple clients):

```bash
npm run brand:init -- --brand acme
```

That scaffolds `workspace/brands/acme/`. Every other command in this guide uses `--brand acme` to target the same tree.

Single-brand alternative (writes to `workspace/brand/` instead):

```bash
npm run brand:init
```

Fill in the generated brand files before running serious analysis:

- `profile.md`
- `audience.md`
- `voice-profile.md`
- `offer.md`
- `stack.json`

## 3. Daily Brief

The daily brief is the easiest way to manage the account without giving the kit permission to change anything.

```bash
npm run daily:brief -- --brand acme --campaigns examples/exports/linkedin-campaigns.csv --leads examples/exports/linkedin-leads.csv --crm examples/exports/crm-leads.csv
```

Alias:

```bash
npm run daily-check -- --brand acme --campaigns examples/exports/linkedin-campaigns.csv
```

It writes a read-only management brief with:

- real signal
- fake signal
- leaks
- today's moves
- do-not-touch-yet items
- data gaps

The brief lands in `workspace/brands/acme/linkedin/briefs/`. Drop `--brand acme` to use the default single-brand tree at `workspace/brand/linkedin/briefs/`.

## 4. Export Mode

Export campaign, creative, lead, or CRM CSVs and run:

```bash
npm run export:brief -- --brand acme --campaigns examples/exports/linkedin-campaigns.csv --leads examples/exports/linkedin-leads.csv --crm examples/exports/crm-leads.csv
```

Single-brand alternative (writes to `workspace/brand/...`):

```bash
npm run export:brief -- --campaigns examples/exports/linkedin-campaigns.csv
```

LinkedIn lead exports can use different column names because forms can be customized per account and mapped to CRM fields. The kit recognizes common aliases like first name, email, work email, company, job title, campaign, ad ID, ad set ID, submitted date, status, and test lead. Columns it does not recognize are preserved in the brief as custom questions or hidden fields.

## 5. Connected Mode

### Getting LinkedIn API Access

Connected Mode needs LinkedIn Marketing Developer Platform access. Plan for this before you start, because the kit cannot shortcut any of it:

- **Apply for the program.** LinkedIn Marketing Developer Platform is an application: [https://business.linkedin.com/marketing-solutions/marketing-partners/become-a-partner](https://business.linkedin.com/marketing-solutions/marketing-partners/become-a-partner). You create a company page, create an app, and request Marketing API access. Approval is not automatic.
- **Realistic timing.** In practice, approval often takes one to four weeks, and LinkedIn may ask for follow-ups about your use case, company, and traffic plans. Do not commit to a connected-launch date until the app is approved.
- **Gated scopes.** The kit requests `r_ads`, `rw_ads`, `r_ads_reporting`, and `r_marketing_leadgen_automation`. All four are gated behind Marketing API approval. `r_marketing_leadgen_automation` (Lead Sync) is often approved separately and sometimes denied even when the others are granted. If Lead Sync is denied, the kit still runs, flags lead data as unavailable in the brief, and tells you to export leads manually from Campaign Manager. That is expected behavior, not a bug.
- **The redirect URI is a placeholder.** `LINKEDIN_REDIRECT_URI=http://localhost:3000/oauth/linkedin/callback` in `.env.example` is *not* a live server. This kit has no local callback listener. The real flow is:
  1. Register the same redirect URI string in your LinkedIn app settings (it only has to match; nothing has to be listening there).
  2. Run `npm run auth` to generate an authorization URL.
  3. Paste the URL into your browser and approve the scopes.
  4. LinkedIn redirects to `http://localhost:3000/oauth/linkedin/callback?code=...&state=...`. Your browser will show a "can't connect" error. That is fine.
  5. Copy the `code` parameter out of the browser's address bar.
  6. Run `npm run auth -- --code PASTE_CODE_HERE` to exchange it for an access token. The token is saved under the brand's `linkedin/cache/`.

This copy-code-from-the-URL-bar dance is the single most confusing part of Connected Mode. Once the token is saved, you will not have to do it again until it expires.

### Configure `.env`

Copy `.env.example` to `.env`, then set:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REDIRECT_URI` (must match the value registered in your LinkedIn app exactly, including the port and path)

### Authorize And Run

```bash
npm run auth -- --brand acme
```

Paste the URL into a browser, approve, copy `?code=...` out of the redirected URL bar, then:

```bash
npm run auth -- --brand acme --code PASTE_CODE_HERE
```

Then pull briefs:

```bash
npm run daily:brief -- --brand acme
npm run connected:brief -- --brand acme
```

`daily:brief` is the normal management loop. `connected:brief` writes the deeper buyer-quality brief and can generate safe draft candidates. If Lead Sync is denied, both commands still work and the brief will label lead-quality sections as "export manually from Campaign Manager."

## 6. Safe Apply

Create or review a draft first:

```bash
npm run draft -- --brand acme --action pause-campaign --target urn:li:sponsoredCampaign:123 --current ACTIVE
```

Dry run:

```bash
npm run apply -- --brand acme --draft workspace/brands/acme/linkedin/drafts/YOUR_DRAFT.md --dry-run
```

The draft must live under that brand's `linkedin/drafts/` folder. Live apply also checks that the draft account matches the selected account recorded for the brand, then requires a signed dry-run receipt less than 24 hours old.

Live apply requires explicit confirmation:

```bash
npm run apply -- --brand acme --draft workspace/brands/acme/linkedin/drafts/YOUR_DRAFT.md --confirm APPLY
```

Single-brand mode: drop `--brand acme` and use `workspace/brand/linkedin/drafts/` instead.

## 7. Claude Code / OpenClaw

Open the repo folder in your agent tool and start with:

```text
Read README.md, SETUP.md, and OPERATOR-PLAYBOOK.md. Then run npm run demo and summarize the generated daily brief and buyer-quality brief.
```

For real account work, prefer Export Mode until API access is approved:

```text
Run the daily LinkedIn Ads brief for brand acme using my campaign export, lead export, and CRM CSV. Do not apply live changes.
```

Live writes should always go through `npm run apply -- --dry-run` before `--confirm APPLY`.
