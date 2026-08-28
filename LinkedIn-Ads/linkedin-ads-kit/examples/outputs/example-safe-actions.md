# demo recommended safe actions

Brand: exampleco
Generated: example-run

## Summary

Safe action candidates generated from the latest brief. Review before applying.

## Actions

### 1. pause_campaign

- Target: urn:li:sponsoredCampaign:1002
- Current: ACTIVE
- Proposed: "PAUSED"
- Risk: medium
- Why this matters: Generic Demo Request has $2,400 spend and no lead signal in the available data.
- Rollback: Set campaign intendedStatus/status back to ACTIVE after reviewing tracking and buyer-quality evidence.

### 2. set_daily_budget

- Target: urn:li:sponsoredCampaign:1004
- Current: 180
- Proposed: {"amount":"126","currencyCode":"USD"}
- Risk: low
- Why this matters: Company Page Trust Gap CPL is materially above account average.
- Rollback: Restore daily budget to 180.

## Machine Draft

```linkedin-ads-draft
{
  "version": 1,
  "generatedAt": "example-run",
  "brand": "exampleco",
  "brandMode": "named",
  "actions": [
    {
      "type": "pause_campaign",
      "brand": "exampleco",
      "adAccountUrn": "example-export",
      "targetUrn": "urn:li:sponsoredCampaign:1002",
      "currentField": "status",
      "currentValue": "ACTIVE",
      "proposedValue": "PAUSED",
      "reason": "Generic Demo Request has $2,400 spend and no lead signal in the available data.",
      "riskLevel": "medium",
      "rollbackNote": "Set campaign intendedStatus/status back to ACTIVE after reviewing tracking and buyer-quality evidence."
    },
    {
      "type": "set_daily_budget",
      "brand": "exampleco",
      "adAccountUrn": "example-export",
      "targetUrn": "urn:li:sponsoredCampaign:1004",
      "currentField": "dailyBudget",
      "currentValue": 180,
      "proposedValue": {
        "amount": "126",
        "currencyCode": "USD"
      },
      "reason": "Company Page Trust Gap CPL is materially above account average.",
      "riskLevel": "low",
      "rollbackNote": "Restore daily budget to 180."
    }
  ]
}
```
