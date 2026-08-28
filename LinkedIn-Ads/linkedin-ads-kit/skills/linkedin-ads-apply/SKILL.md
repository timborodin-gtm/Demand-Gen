---
name: linkedin-ads-apply
description: Review and apply safe LinkedIn Ads Kit draft actions with preflight validation, explicit approval, and audit trail.
---

# LinkedIn Ads Apply

Use this skill when applying a draft to LinkedIn Ads.

Read first:

- `../linkedin-ads/references/safe-apply-model.md`

## Rules

- Never apply without a draft file.
- Never live apply without `--confirm APPLY`.
- Dry run first when possible.
- Refuse unknown, destructive, or irreversible actions.
- Verify the current value before writing.
- Verify the draft brand and ad account match the active workspace.
- Write an audit trail after every live apply attempt.

## Allowed V1 Actions

- pause campaign
- pause creative
- activate already-approved creative
- update daily budget
- create Thought Leader Ad creative only when the campaign, post URN, permissions, and score gate are valid

## Refuse

- delete operations
- broad campaign creation
- audience expansion changes without manual review
- drafts with mismatched brand or unknown current values
- Thought Leader Ad creative actions for `manual_review` posts
