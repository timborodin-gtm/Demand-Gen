---
name: buyer-quality-audit
description: Diagnose LinkedIn Ads performance through buyer quality, not cheap lead volume.
---

# Buyer Quality Audit

Use this when reviewing lead performance.

Read first:

- `../linkedin-ads/references/operator-thesis.md`
- `../linkedin-ads/references/buyer-quality-rubric.md`
- `../linkedin-ads/references/export-formats.md` when exports are involved

## Required Context

Load brand context before judging performance:

- `workspace/brand/` for default mode
- `workspace/brands/<slug>/` when a brand is specified
- latest brief, connected cache, export files, lead exports, and CRM notes when available

If lead or CRM outcome data is missing, say that the read is media-only and name the missing file or field.

## Questions

- Which leads became sales-accepted, opportunities, pipeline, or customers?
- Which campaigns produced disqualified leads?
- What job titles, company sizes, industries, and seniorities show up?
- Are bad-fit leads coming from the offer, targeting, form, or sales handoff?

## Process

1. State the mode and data sources.
2. Separate platform lead volume from sales/CRM quality.
3. Classify each major source as real signal, fake signal, unknown, or leak.
4. Identify the most likely root cause.
5. Keep recommendations manual-only when lead/CRM data is missing.

## Output

Give:

- buyer-quality diagnosis
- likely cause
- evidence
- why this matters
- what to do next
- what not to optimize yet

Never treat CPL as the final answer.
