# Safe Apply Model

Use this before drafting or applying live LinkedIn Ads changes.

## Operating Rule

The kit is an operator with a seatbelt, not a bot with a credit card.

Every live write requires:

- draft file under the resolved brand's `linkedin/drafts/` folder
- brand/account validation against the selected account recorded for that brand
- allowed action type
- preflight current-value check
- signed dry-run receipt less than 24 hours old
- explicit `--confirm APPLY`
- post-apply result
- audit trail
- rollback note

## Allowed V1 Actions

- pause campaign
- pause creative
- set campaign daily budget
- activate already-approved creative
- create Thought Leader Ad creative draft when score gate, URNs, and permissions pass

## Refuse

- delete operations
- broad campaign creation
- audience expansion changes
- bid strategy changes
- irreversible account changes
- unknown current values
- wrong brand
- wrong ad account
- draft path outside the resolved brand workspace
- missing, stale, edited, or forged dry-run receipt
- stale current values
- manual-review Thought Leader posts

## Export Mode Drafting

Export Mode should be conservative.

Do not create apply-ready actions when:

- account is unknown
- campaign URN is missing
- data is historical or paused
- current value cannot be verified
- spend pattern needs live confirmation

Give manual recommendations instead.

## Apply Commands

Dry run:

```bash
npm run apply -- --brand <slug> --draft <path> --dry-run
```

Live apply:

```bash
npm run apply -- --brand <slug> --draft <path> --confirm APPLY
```

## Audit Trail

Audit entries should preserve:

- draft path
- brand
- expected current values
- observed current values
- results
- errors or partial failures
- rollback guidance
