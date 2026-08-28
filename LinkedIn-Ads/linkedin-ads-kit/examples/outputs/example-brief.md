# LinkedIn Ads Brief

Brand: exampleco
Source: demo
Generated: example-run

## Executive Summary

- Spend reviewed: $11,225
- Impressions: 278,300
- Clicks: 1,797
- Leads: 78
- CTR: 0.65%
- CPL: $144
- Qualified lead signal: 11/40

- 1 campaign(s) spent at least $200 without lead signal.

## Trust Gap

- Company Page Trust Gap spent $1,950 with CTR 0.17% and only 2 lead(s). Company-page creative without enough credibility. Test a Thought Leader Ad, add proof, or rewrite around a sharper buyer pain before scaling.

## Buyer-Quality Diagnosis

The default question is not "did we get cheap leads?" The question is "did paid LinkedIn create evidence that the right buyers are moving closer to a real sales conversation?"

Lead volume is not translating into enough qualified signal. Tighten the ICP, add friction where it filters bad fits, and inspect the offer promise before increasing budget.

## Campaign And Account Structure

1 campaign(s) show spend without lead signal. These are pause or budget-reduction candidates if tracking is healthy.

1 campaign(s) have weak CTR. That usually points to offer, hook, or audience mismatch.

## Creative And Offer Angle

The brand offer file is available and should be used to judge whether ads are selling a real next step.

Creative is not the first obvious bottleneck from the aggregate data. Keep pressure on buyer quality and sales handoff.

## Lead Form And Sales Handoff

Lead data is available. Map form fields to CRM stages so the next brief can separate cheap leads from real buyers.

Mapped lead fields detected: Work Email (20/40), Company Name (20/40), Job Title (20/40), Company Size (20/40), Campaign (40/40), Ad ID (20/40), Form Name (20/40), Submitted At (20/40), Test Lead (20/40). Missing useful handoff fields: Email Address, Ad Set ID. Test leads flagged: 0/20.

Custom questions / hidden fields preserved: Sales Owner (20/40), UTM Campaign Hidden (20/40), Biggest Lead Quality Complaint (19/40), What Is Your Monthly Paid Social Spend (19/40), Which CRM Do You Use Today (19/40), Deal Amount (4/40). Treat these as qualification, routing, and attribution signals rather than discarding them during CRM import.

Lead source concentration: Generic Demo Request (12), Thought Leader Test - CFO Pain (8), Founder POV - Pipeline Quality (6), Handoff Leak - Revenue Ops Form (6), CFO Pain - Video Hook Test (4). Use this to compare lead quality by campaign or offer, not just total lead count.

## Thought Leader Ads Opportunities

Use Thought Leader Ads when the post carries human trust that the company page cannot fake. Prioritize posts with buyer pain, proof, a sharp point of view, and comments from people who resemble the ICP.

Recommended next move:

- Collect 5-10 posts from the listed thought leaders in `voice-profile.md`.
- Score them with `npm run draft -- --action thought-leader-ad --post "<url>" --post-text "<text>"`.
- Launch manually if approval/API access blocks creation.

## Approved-Safe Next Actions

- Pause campaign urn:li:sponsoredCampaign:1002: Generic Demo Request has $2,400 spend and no lead signal in the available data.
- Set campaign budget urn:li:sponsoredCampaign:1004 from 180 to a reduced daily amount: Company Page Trust Gap CPL is materially above account average.

## Manual-Only Recommendations

- Review audience expansion and non-ICP targeting before increasing spend.
- Compare lead form submissions against CRM outcomes, not just LinkedIn CPL.
- Add one qualifying question if sales reports bad-fit leads.
- Build a sales handoff note for every high-intent form or Thought Leader Ad campaign.

## Connected Metadata

- API version: 202604
- Ad account: example-export
