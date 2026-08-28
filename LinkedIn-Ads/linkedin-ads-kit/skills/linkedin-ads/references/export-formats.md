# Export Formats

Use this when running Export Mode or troubleshooting user-provided CSVs.

## Campaign / Creative Performance

The parser supports:

- comma, tab, or semicolon delimiters
- UTF-8 and UTF-16 exports
- LinkedIn report metadata rows before the actual header
- campaign-level rows
- creative/ad-level rows aggregated back to campaign ID

Useful columns:

- Campaign ID
- Campaign Name
- Campaign Status
- Daily Budget
- Currency
- Total Spent or Spend
- Impressions
- Clicks
- Leads
- Conversions
- Ad ID
- Ad Name
- Ad Status

If the export is creative-level, campaign rows should be aggregated by Campaign ID. Do not treat every creative row as a separate campaign.

## Lead Form Exports

There is no single universal lead CSV shape because LinkedIn forms and CRM field names can be customized.

Recognize common aliases:

- First Name
- Last Name
- Email Address
- Work Email
- Phone
- Company Name
- Job Title
- Company Size
- Country
- Industry
- Seniority
- Campaign
- Campaign ID
- Ad ID
- Ad Set ID
- Form Name
- Submitted At
- Test Lead
- Status
- Notes

Preserve unmapped columns as custom questions or hidden fields. These are often the most useful sales handoff signals.

## CRM / Sales Notes

Useful columns:

- Lead ID
- Campaign
- CRM Stage
- Sales Notes
- Opportunity Amount
- Disqualification Reason
- Owner
- Follow-up Status

Map outcomes into:

- qualified
- disqualified
- unknown
- sales accepted
- opportunity
- customer

## Confidence Labels

- **High:** campaign data + lead export + CRM outcomes + brand context
- **Medium:** campaign data + lead export or CRM notes
- **Low:** campaign data only
- **Media-only:** no lead or CRM outcome data

Always state the confidence limitation before recommending budget moves.
