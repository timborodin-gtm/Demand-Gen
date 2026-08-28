---
name: thought-leader-ad-selector
description: Score LinkedIn posts for Thought Leader Ad potential and produce API or Campaign Manager launch instructions.
---

# Thought Leader Ad Selector

Use this when evaluating posts for paid amplification.

Read first:

- `../linkedin-ads/references/thought-leader-rubric.md`
- `../linkedin-ads/references/operator-thesis.md`
- `../linkedin-ads/references/safe-apply-model.md` when drafting API actions

## Required Context

Load brand context first:

- ICP and buyer pain from `audience.md`
- offer and sales usefulness from `offer.md`
- approved thought leaders and voice from `voice-profile.md`
- organic post URL, post text, reactions, comments, and shares when available

## Score

Score candidates on:

- ICP fit
- buyer pain
- trust
- organic signal
- offer fit
- sales usefulness

## Score Gates

- `strong_candidate`: 75+
- `test_candidate`: 55-74
- `manual_review`: below 55

## Strong Candidate

A strong candidate sounds like a real person, names a buyer problem, carries proof or lived experience, and starts a conversation sales would be glad to enter.

## Process

1. Score the post across all six dimensions.
2. Explain which signal carried the score and which signal is missing.
3. Decide whether this is strong candidate, test candidate, or manual review.
4. If API inputs are missing or permissions are blocked, produce a Campaign Manager packet.
5. If the post is manual review, say not to sponsor yet.

## API Rule

Only produce an API creative draft when:

- the post is `test_candidate` or `strong_candidate`
- campaign URN and post URN are available
- account permissions support the operation

For `manual_review`, produce a Campaign Manager review packet that says not to sponsor yet.

## Output

- score
- why it should or should not be sponsored
- why this matters
- what to do next
- audience
- budget test
- UTM
- approval request copy
- API draft only when the score gate and required URNs pass
- Campaign Manager fallback when API or permissions block creation
