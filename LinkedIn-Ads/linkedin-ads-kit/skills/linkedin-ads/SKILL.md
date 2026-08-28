---
name: linkedin-ads
description: >
  Core LinkedIn Ads Kit operator workflow for buyer-quality audits, export-mode briefs,
  connected-mode account reads, safe draft recommendations, Thought Leader Ad selection,
  workspace memory, and guarded apply paths.
---

# LinkedIn Ads Operator

Use this skill when the user asks for a LinkedIn Ads audit, account read, campaign diagnosis, optimization plan, export-mode brief, connected-mode brief, or end-to-end kit workflow.

This is the orchestrator skill. Load only the references needed for the task.

## Read First

| Need | Reference |
|------|-----------|
| Core point of view | `references/operator-thesis.md` |
| API/account data | `references/api-data-map.md` |
| Manual exports | `references/export-formats.md` |
| Lead and CRM quality | `references/buyer-quality-rubric.md` |
| Lead forms | `references/lead-form-playbook.md` |
| Thought Leader Ads | `references/thought-leader-rubric.md` |
| Safe drafts/apply | `references/safe-apply-model.md` |
| Brief writing | `references/brief-template.md` |

## Mode Detection

Start every run by identifying the operating mode.

**Daily Brief**

Use this first when the user asks how to manage LinkedIn Ads today, wants a morning check, or wants guidance without live changes.

```bash
npm run daily:brief -- --campaigns <csv> --leads <csv> --crm <csv>
```

Connected daily brief:

```bash
npm run daily:brief -- --brand <slug>
```

The daily brief is read-only by default. It should answer: real signal, fake signal, leaks, today's moves, do-not-touch-yet items, and data gaps.

**Export Mode**

Use when the user provides CSVs, screenshots, CRM notes, sales notes, or does not have LinkedIn API access yet.

Primary command:

```bash
npm run export:brief -- --campaigns <csv> --leads <csv> --crm <csv>
```

Named brand:

```bash
npm run export:brief -- --brand <slug> --campaigns <csv> --leads <csv> --crm <csv>
```

**Connected Mode**

Use when OAuth is configured and the user wants live account/campaign/creative/reporting/lead-form reads.

Setup commands:

```bash
npm run auth -- --brand <slug>
npm run doctor -- --brand <slug>
npm run connected:brief -- --brand <slug>
```

Lead Sync is separately gated. If lead form responses fail, continue with ad account, campaign, creative, reporting, and lead-form metadata. Ask for manual lead exports when needed.

## Brand Context Protocol

Load brand context before judging performance.

Default workspace:

```text
workspace/brand/
```

Named workspace:

```text
workspace/brands/<slug>/
```

Read these files when present:

- `profile.md` - category, positioning, proof, constraints
- `audience.md` - ICP, buying committee, disqualifiers, buyer pain
- `voice-profile.md` - brand voice, thought leaders, POVs
- `offer.md` - primary offer, conversion path, qualification signals
- `stack.json` - ad account ID, CRM, CPL and qualified-lead targets
- `learnings.md` - durable past findings
- `linkedin/account.md` - selected account and benchmarks
- `linkedin/cache/last-connected-pull.json` - latest connected API pull

If brand files are thin, say what is missing and keep confidence lower. Do not invent ICP, offer, or sales outcomes.

## Data Acquisition

### Export Mode Inputs

Preferred:

- LinkedIn campaign or creative performance export
- LinkedIn lead form export
- CRM outcomes or sales notes
- offer/landing page notes

Accept partial data. State confidence limits clearly:

- media-only read: campaign/creative export, no lead/CRM outcomes
- lead-quality read: lead/CRM outcomes available
- operator read: campaign, lead, CRM, and brand context available

Read `references/export-formats.md` for column expectations and parser behavior.

### Connected Mode Inputs

Run `connected:brief` or read the latest cache:

```text
workspace/brands/<slug>/linkedin/cache/last-connected-pull.json
```

Expected connected pull:

- ad accounts
- campaign groups
- campaigns
- creatives
- ad analytics
- lead forms
- lead form responses when Lead Sync is available

Read `references/api-data-map.md` before troubleshooting API shape or permission issues.

## Diagnosis Order

Diagnose in this order. Do not jump straight to tactical changes.

1. **Buyer quality**
   - Did the spend create qualified leads, sales-accepted leads, opportunities, pipeline, or customers?
   - Are cheap leads hiding bad fit?
   - What sales feedback matters more than LinkedIn CPL?
2. **Offer fit**
   - Is the offer specific enough for expensive LinkedIn attention?
   - Does the conversion path preserve buyer intent?
3. **Audience and account structure**
   - Are campaigns isolating different buying committees or mixing intent?
   - Is audience expansion or broad targeting creating fake volume?
4. **Creative and angle**
   - Does the ad name buyer pain, proof, and cost of inaction?
   - Are company-page ads missing human trust?
5. **Lead form friction**
   - Is the form filtering bad-fit leads without blocking good buyers?
   - Are custom answers and hidden fields preserved for sales?
6. **Sales handoff**
   - Does sales know which promise, pain, post, form, and campaign started the conversation?
7. **Thought Leader Ads**
   - Which human posts deserve paid distribution?
   - Which posts should stay manual-review because engagement is not buyer quality?

Use `references/buyer-quality-rubric.md`, `references/lead-form-playbook.md`, and `references/thought-leader-rubric.md` for deeper scoring.

## Draft Creation Rules

Only stage machine-applyable drafts when:

- the action is reversible or controllable
- the account/brand context is known
- current value can be verified before apply
- the evidence is stronger than a generic best practice

Allowed V1 draft actions:

- pause campaign
- pause creative
- set campaign daily budget
- activate already-approved creative
- create Thought Leader Ad creative draft only when the score gate, URNs, and permissions support it

Never draft:

- delete operations
- broad campaign creation
- irreversible account changes
- audience expansion changes
- weak Thought Leader posts scored `manual_review`
- live writes without explicit apply

Read `references/safe-apply-model.md` before producing or applying drafts.

## Output Shape

Every operator response should include:

1. Mode and data sources
2. Confidence level
3. Real signal
4. Fake signal
5. Leaks
6. Today's moves
7. Do-not-touch-yet items
8. Data gaps
9. Executive summary for deeper briefs
10. Buyer-quality diagnosis
11. Campaign/account structure issues
12. Creative and offer angle diagnosis
13. Lead form and sales handoff diagnosis
14. Thought Leader Ads opportunities
15. Approved-safe next actions
16. Manual-only recommendations
17. Missing data and next export/API steps

Every recommendation must answer:

- why this matters
- what to do next
- whether it is safe to draft or manual-only

Read `references/brief-template.md` when writing a full brief.

## Memory Rules

Append durable findings to `learnings.md` when a real pattern emerges:

- campaign/source created buyer-quality signal
- sales rejected a lead pattern
- offer angle worked or failed
- form field predicted quality
- Thought Leader post deserved or did not deserve spend
- safe action was applied or rejected

Do not write vague learnings like "optimize creative." Make them useful for the next run.

## Safety Rules

- Treat LinkedIn Ads as expensive attention. Do not optimize on CPL alone.
- Do not make live changes from a diagnosis.
- Live writes require a draft file, dry-run when possible, `--confirm APPLY`, current-value validation, audit trail, and rollback note.
- If data is historical, paused, missing account context, or missing current values, keep the recommendation manual-only.
- If the user wants Connected Mode but API access is missing, continue with Export Mode.
