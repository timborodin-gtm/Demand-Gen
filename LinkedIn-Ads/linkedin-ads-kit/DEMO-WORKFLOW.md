# Demo Workflow

This walkthrough shows the full kit loop without touching a real LinkedIn account.

You will use sanitized example data, generate the daily management brief, generate a deeper buyer-quality brief, inspect a safe draft, and see where the kit stores brand memory.

## 1. Run The Demo

```bash
npm install
npm run demo
```

By default, the demo creates a named brand workspace:

```text
workspace/brands/exampleco/
```

It seeds ExampleCo brand memory from `examples/brand/`, reads the CSVs in `examples/exports/`, and writes:

```text
workspace/brands/exampleco/linkedin/briefs/
workspace/brands/exampleco/linkedin/drafts/
workspace/brands/exampleco/learnings.md
```

## 2. Read The Daily Brief First

Open the newest file in:

```text
workspace/brands/exampleco/linkedin/briefs/
```

Look for these sections:

- The 5 Daily LinkedIn Ads Questions
- Snapshot
- Real Signal
- Fake Signal
- Leaks
- Today's Moves
- Do Not Touch Yet
- Data Gaps

This is the management product. It helps you decide what to do today even if you never let the kit apply changes.

## 3. Read The Deeper Brief

Open the newest non-daily brief in:

```text
workspace/brands/exampleco/linkedin/briefs/
```

Look for these sections:

- Executive Summary
- Buyer-Quality Diagnosis
- Campaign And Account Structure
- Creative And Offer Angle
- Lead Form And Sales Handoff
- Thought Leader Ads Opportunities
- Approved-Safe Next Actions
- Manual-Only Recommendations

The brief should make the core point obvious:

> LinkedIn Ads should not be judged by cheap lead volume alone. It should be judged by whether paid attention is creating real buyer conversations.

## 4. Inspect The Safe Draft

Open the newest file in:

```text
workspace/brands/exampleco/linkedin/drafts/
```

The draft has two parts:

- A human-readable summary explaining the action and rollback
- A machine-readable `linkedin-ads-draft` JSON block for safe apply

This is the review layer. Nothing goes live just because the kit found a problem.

## 5. Try A Dry Run

The demo data is export-only, so it does not have a real LinkedIn token. On a real connected account, the next step would be:

```bash
npm run apply -- --brand exampleco --draft workspace/brands/exampleco/linkedin/drafts/YOUR_DRAFT.md --dry-run
```

Dry run checks:

- the draft brand matches the workspace brand
- the draft ad account matches the brand account
- the current value still matches the draft
- the action type is allowed

## 6. Review The Example Outputs

Committed example outputs live in:

```text
examples/outputs/
```

Use them as a quick swipe file for what the kit is trying to produce:

- `example-brief.md`
- `example-daily-brief.md`
- `example-safe-actions.md`

## 7. Run A Named Brand Demo

You can run the same demo with a different brand slug:

```bash
npm run demo -- --brand acme
```

That writes to:

```text
workspace/brands/acme/
```

This is the multi-brand pattern: one kit, many brand memories.

## 8. Connect A Real Account Later

When you are ready for live data:

```bash
cp .env.example .env
npm run auth -- --brand acme
npm run daily:brief -- --brand acme
npm run connected:brief -- --brand acme
```

Export Mode and Connected Mode feed the same operator brief engine. Connected Mode simply gives the kit fresher account data and safer current-value checks for apply.
