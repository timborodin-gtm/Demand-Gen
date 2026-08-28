---
name: lead-quality-mapper
description: Map LinkedIn lead form and CRM records into fit, intent, and sales-readiness signals.
---

# Lead Quality Mapper

Use this when lead exports or CRM files are available.

Read first:

- `../linkedin-ads/references/export-formats.md`
- `../linkedin-ads/references/buyer-quality-rubric.md`
- `../linkedin-ads/references/lead-form-playbook.md`

## Required Context

Load brand context first:

- ICP, disqualifiers, and buyer pain from `audience.md`
- qualification signals from `offer.md`
- CRM target stage from `stack.json`

Then map lead exports and CRM files. Preserve custom questions and hidden fields instead of discarding unmapped columns.

## Map Leads Into

- qualified
- disqualified
- unknown
- sales accepted
- opportunity
- customer

## Look For

- seniority mismatch
- company-size mismatch
- student/vendor/competitor leads
- missing business email
- vague intent
- no sales follow-up

## Process

1. Normalize known lead fields and preserve unknown columns.
2. Map CRM and sales language into qualified, disqualified, or unknown.
3. Group quality patterns by campaign, form, ad, offer, title, company size, and custom answers.
4. Name the missing field that would improve confidence.

## Recommendation Pattern

For every issue, name whether it is likely:

- audience problem
- offer problem
- form problem
- handoff problem
- tracking problem

## Output

For every pattern, include:

- evidence
- why this matters
- what to do next
