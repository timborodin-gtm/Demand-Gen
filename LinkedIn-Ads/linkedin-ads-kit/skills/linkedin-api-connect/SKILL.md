---
name: linkedin-api-connect
description: Connect to LinkedIn Marketing APIs, verify permissions, select an ad account, and pull campaign, creative, reporting, and lead-form data.
---

# LinkedIn API Connect

Use this skill for Connected Mode setup or troubleshooting.

Read first:

- `../linkedin-ads/references/api-data-map.md`

## Checklist

- Confirm `.env` has `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and `LINKEDIN_REDIRECT_URI`.
- Use `LINKEDIN_API_VERSION`, defaulting to `202604`.
- Run `npm run auth` or `npm run auth -- --brand <slug>` to generate the OAuth URL.
- Exchange the returned code with `npm run auth -- --code <code>` or `npm run auth -- --brand <slug> --code <code>`.
- Run `npm run doctor` or `npm run doctor -- --brand <slug>` to verify setup.
- Run `npm run connected:brief` or `npm run connected:brief -- --brand <slug>`.

## Permissions

Marketing API access and Lead Sync access are separate. If Lead Sync is blocked, continue with campaign, creative, reporting, and lead-form metadata reads. The warning should attach to `leadFormResponses`, not the whole connected pull.

Ask for manual lead export data when Lead Sync is unavailable.

## Troubleshooting Output

Include:

- which API step failed
- whether account/campaign/reporting data is still usable
- whether the warning belongs to `leadForms` or `leadFormResponses`
- what manual export would unblock buyer-quality analysis

## Headers

Every LinkedIn Marketing API call must include:

- `Linkedin-Version`
- `X-Restli-Protocol-Version: 2.0.0`
