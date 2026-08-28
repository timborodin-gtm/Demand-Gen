# Operator Playbook

LinkedIn Ads Kit is built around one belief:

> LinkedIn Ads fails when teams optimize for cheap leads instead of buyer-quality signal.

This playbook explains the operating model behind the kit.

## The Buyer-Quality Framework

Every account read starts with five questions.

| Question | Why It Matters |
|----------|----------------|
| Are we reaching the buying committee? | LinkedIn clicks are expensive. Wrong-role attention is not a win. |
| Is the offer specific enough? | Generic demo requests usually create weak intent. |
| Does the creative create trust? | Company-page ads often lack the human credibility LinkedIn needs. |
| Does the form filter for fit? | Lower friction is not always better if it floods sales with bad leads. |
| Does sales know what conversation the ad started? | A good lead can still die if the handoff has no context. |

The kit should never stop at "CPL is up" or "CTR is down." It should explain what the signal means for pipeline quality.

## The Four LinkedIn Ads States

### 1. Real Signal

The campaign is producing evidence that the right buyers care.

Look for:

- qualified leads
- opportunity-stage CRM matches
- comments from ICP buyers
- form answers that show real pain
- sales notes that mention urgency or fit

Operator move:

- protect the learning
- scale slowly
- create sibling angles
- document why it works

### 2. Fake Signal

The campaign looks good in-platform but produces weak downstream quality.

Look for:

- cheap CPL
- strong CTR
- weak company fit
- students, vendors, tiny companies, job seekers
- sales rejection notes

Operator move:

- stop celebrating the dashboard
- tighten audience or form friction
- rewrite the offer around a more specific buyer problem
- reduce or pause spend if quality does not recover

### 3. Trust Gap

The audience and offer may be right, but the ad does not have enough credibility.

The daily brief surfaces this under its own `## Trust Gap` section. A campaign is flagged when it is a company-page creative (not a Thought Leader Ad), has meaningful spend (>= the fake-signal threshold), CTR below `LOW_CTR_TRUST_GAP_PCT` (defaults to 0.4%, roughly the LinkedIn feed benchmark for company-page content), and fewer than `LOW_LEADS_TRUST_GAP_COUNT` leads.

Look for:

- low CTR on company-page ads
- generic product claims
- weak proof
- no founder/operator/customer voice
- organic posts outperforming paid creative

Operator move:

- test Thought Leader Ads
- add proof
- turn internal POV into external creative
- use a human voice when the company voice feels flat

### 4. Handoff Leak

The ad creates interest, but the lead dies after conversion.

Look for:

- sales accepted rate below expectation
- delayed follow-up
- reps lacking ad/form context
- no qualification notes
- CRM stages that do not map to campaign or offer

Operator move:

- add hidden campaign context
- write sales handoff notes
- add one fit question
- map form answers to sales talking points

## What To Pause

Pause candidates usually have:

- meaningful spend
- no lead or buyer-quality signal
- weak CTR or weak conversion
- active status
- no tracking reason to wait

Do not pause just because one metric looks bad. Pause when the account has enough evidence that the spend is not buying learning or buyers.

## What To Rewrite

Rewrite candidates usually have:

- right audience, weak response
- high impressions and low CTR
- vague offer
- company-centric copy
- no proof
- no clear buyer pain

Rewrite around:

- the expensive problem
- the cost of inaction
- a real operator insight
- a proof point
- a more specific next step

## What To Leave Alone

Leave something alone when:

- it has low spend and insufficient data
- tracking is clearly broken
- sales feedback is missing
- it is producing strong buyer-quality signal even if CPL is not pretty
- it is part of a deliberate learning test

The kit should not create fake confidence by overreacting to thin data.

## Thought Leader Ads Rubric

Thought Leader Ads work when the post has trust the brand page cannot manufacture.

Score posts on:

| Signal | Strong Candidate |
|--------|------------------|
| ICP fit | The right roles would feel the pain immediately. |
| Buyer pain | The post names an expensive business problem. |
| Trust | It sounds like lived experience, not corporate copy. |
| Organic signal | The market reacted before paid spend. |
| Offer fit | There is a natural next step from the post to the offer. |
| Sales usefulness | Sales would know how to continue the conversation. |

Do not sponsor a post just because it got likes.

Sponsor the post when it starts the exact conversation your sales team wants to have.

## Lead Form Rules

Low friction is not automatically good.

Use less friction when:

- the offer is high intent
- audience targeting is tight
- sales can quickly qualify
- the account needs volume for learning

Use more friction when:

- sales is rejecting leads
- bad-fit segments are common
- the offer attracts curiosity
- company size, role, or urgency matters

One good qualification question can save thousands in wasted spend and sales time.

## Sales Handoff Rules

Every high-intent campaign should give sales:

- campaign name
- offer
- ad angle
- form answers
- buyer pain promised in the ad
- likely disqualifiers
- first follow-up angle

The rep should know what conversation the ad already started.

## The Daily Operator Brief

A useful brief should answer:

1. Are we buying real buyers?
2. What is creating fake confidence?
3. Where is the leak between ad, form, and sales?
4. What should we do next?
5. What should we avoid touching yet?

The brief is not a report. It is a decision tool.

The default daily sections are:

- Real Signal
- Fake Signal
- Trust Gap (only rendered when at least one company-page campaign matches the thresholds above)
- Leaks
- Today's Moves
- Do Not Touch Yet
- Data Gaps

## The Safety Model

LinkedIn Ads Kit can read freely, but writes carefully.

Live apply requires:

- a draft file
- explicit confirmation
- current-value verification
- brand/account validation
- audit trail
- rollback notes

This keeps the agent useful without turning it into a bot with a credit card.
