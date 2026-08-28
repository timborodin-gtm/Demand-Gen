# API Data Map

Use this when working in Connected Mode or debugging LinkedIn API fixtures/cache.

## Required Headers

Every Marketing API request must send:

- `Linkedin-Version`
- `X-Restli-Protocol-Version: 2.0.0`

The default pinned version is `202604`.

## Environment

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REDIRECT_URI`
- `LINKEDIN_API_VERSION`
- optional `LINKEDIN_AD_ACCOUNT_ID`
- optional `LINKEDIN_ACCESS_TOKEN`

## Connected Pull

The V1 connected brief pulls:

| Data | Client Method | Why It Matters |
|------|---------------|----------------|
| Ad accounts | `getAdAccounts` | discovers/selects the account |
| Campaign groups | `getCampaignGroups` | account structure context |
| Campaigns | `getCampaigns` | names, status, budgets, objectives |
| Creatives | `getCreatives` | creative inventory and post references |
| Reporting | `getAnalytics` | impressions, clicks, spend, leads, conversions |
| Lead forms | `getLeadForms` | form metadata and questions |
| Lead responses | `getLeadFormResponses` | buyer/lead quality when Lead Sync is available |

Cache path:

```text
workspace/brands/<slug>/linkedin/cache/last-connected-pull.json
```

Default brand path:

```text
workspace/brand/linkedin/cache/last-connected-pull.json
```

## Lead Sync Split

Lead forms and Lead Sync responses are separate surfaces.

Accept this state:

- campaign/creative/reporting reads succeed
- lead-form metadata succeeds
- `leadFormResponses` fails with 403 or permission denial

The connected brief should continue and warn on `leadFormResponses`, not mark the whole pull as failed.

Operator response:

- Say campaign/reporting data is available.
- Say lead-form metadata is available if it is.
- Ask for manual lead exports or CRM notes to judge buyer quality.

## Connected Cache Checks

When auditing a connected run, inspect:

- `cache.account`
- `cache.campaigns.data.elements`
- `cache.creatives.data.elements`
- `cache.analytics.data.elements`
- `cache.leadForms.data.elements`
- `cache.leadResponses.error`

If analytics rows do not map to campaign URNs, draft recommendations should stay manual-only until current account reads can verify targets.
