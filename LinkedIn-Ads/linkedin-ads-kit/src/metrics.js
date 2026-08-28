import { numberValue, pick } from "./csv.js";
import { normalizeCampaignUrn } from "./urns.js";
export { summarizeLeadRows } from "./leads.js";

/** Minimum spend (USD) for a zero-lead campaign to be flagged as high spend. */
export const HIGH_SPEND_NO_LEAD_THRESHOLD_USD = 200;

// Thresholds that gate the "Trust Gap" state documented in OPERATOR-PLAYBOOK.md.
// CTR is expressed as a decimal (0.004 == 0.4%). Company-page feed ads commonly
// clear 0.4% when the creative earns trust, so falling below it while also
// failing to generate leads is our Trust Gap tell.
export const LOW_CTR_TRUST_GAP_PCT = 0.4;
export const LOW_CTR_TRUST_GAP_DECIMAL = LOW_CTR_TRUST_GAP_PCT / 100;
export const LOW_LEADS_TRUST_GAP_COUNT = 3;

const COMPANY_PAGE_VARIANTS = new Set([
  "company_page",
  "company",
  "companyupdate",
  "company_update",
  "sponsored_content",
  "sponsored_update",
  "single_image",
  "single_image_ad",
  "video",
  "video_ad",
  "carousel",
  "carousel_ad",
  "document",
  "document_ad",
  "standard_update",
  "spotlight",
  "text_ad"
]);

const THOUGHT_LEADER_VARIANTS = new Set([
  "thought_leader",
  "thought_leader_ad",
  "thoughtleader",
  "thoughtleaderad",
  "direct_sponsored_content",
  "member_update",
  "member",
  "personal"
]);

function normalizeVariantValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Classify a campaign's creative variant so we can tell Trust Gap candidates
// (company-page creatives) apart from Thought Leader Ads (which carry personal
// credibility and should not be flagged for a trust deficit).
export function classifyCreativeVariant(row) {
  const raw = pick(row, [
    "variant",
    "creative_variant",
    "ad_variant",
    "format",
    "ad_format",
    "creative_format",
    "creative_type",
    "ad_type",
    "content_format"
  ], "");
  const normalized = normalizeVariantValue(raw);
  if (!normalized) return { raw: "", normalized: "", kind: "unknown" };
  if (THOUGHT_LEADER_VARIANTS.has(normalized)) return { raw, normalized, kind: "thought_leader" };
  if (COMPANY_PAGE_VARIANTS.has(normalized)) return { raw, normalized, kind: "company_page" };
  if (/thought|leader|member|personal/.test(normalized)) return { raw, normalized, kind: "thought_leader" };
  if (/company|sponsored|page|carousel|spotlight|document|image|video|text/.test(normalized)) {
    return { raw, normalized, kind: "company_page" };
  }
  return { raw, normalized, kind: "other" };
}

export function summarizeCampaignRows(rows = []) {
  const campaigns = aggregateCampaigns(rows.map((row, index) => normalizeCampaignRow(row, index)));
  const totals = campaigns.reduce((memo, campaign) => {
    memo.impressions += campaign.impressions;
    memo.clicks += campaign.clicks;
    memo.spend += campaign.spend;
    memo.leads += campaign.leads;
    memo.conversions += campaign.conversions;
    return memo;
  }, { impressions: 0, clicks: 0, spend: 0, leads: 0, conversions: 0 });

  totals.ctr = totals.impressions ? totals.clicks / totals.impressions : 0;
  totals.cpl = totals.leads ? totals.spend / totals.leads : null;
  totals.conversionRate = totals.clicks ? totals.leads / totals.clicks : 0;

  const trustGapCandidates = findTrustGapCandidates(campaigns);

  return { campaigns, totals, trustGapCandidates };
}

function aggregateCampaigns(campaignRows) {
  const campaignsByKey = new Map();

  for (const campaign of campaignRows) {
    const key = campaign.targetUrn || campaign.name;
    const existing = campaignsByKey.get(key);

    if (!existing) {
      campaignsByKey.set(key, {
        ...campaign,
        sourceRowCount: 1
      });
      continue;
    }

    existing.impressions += campaign.impressions;
    existing.clicks += campaign.clicks;
    existing.spend += campaign.spend;
    existing.leads += campaign.leads;
    existing.conversions += campaign.conversions;
    existing.status = preferredStatus(existing.status, campaign.status);
    existing.dailyBudget = existing.dailyBudget ?? campaign.dailyBudget;
    existing.currencyCode = existing.currencyCode || campaign.currencyCode;
    existing.sourceRowCount += 1;
    existing.ctr = existing.impressions ? existing.clicks / existing.impressions : 0;
    existing.cpl = existing.leads ? existing.spend / existing.leads : null;
  }

  return Array.from(campaignsByKey.values()).map((campaign) => ({
    ...campaign,
    ctr: campaign.impressions ? campaign.clicks / campaign.impressions : 0,
    cpl: campaign.leads ? campaign.spend / campaign.leads : null
  }));
}

function preferredStatus(left = "", right = "") {
  if (/\bactive\b/i.test(left)) return left;
  if (/\bactive\b/i.test(right)) return right;
  return left || right;
}

export function normalizeCampaignRow(row, index = 0) {
  const name = pick(row, ["campaign_name", "campaign", "name"], `Campaign ${index + 1}`);
  const targetUrn = normalizeCampaignUrn(pick(row, ["campaign_urn", "campaign_id", "id", "urn"], ""));
  const status = pick(row, ["status", "campaign_status", "intended_status"], "");
  const dailyBudget = numberValue(row, ["daily_budget", "budget", "daily_budget_amount"], null);
  const currencyCode = pick(row, ["currency_code", "daily_budget_currency", "currency"], "USD");
  const impressions = numberValue(row, ["impressions"]);
  const clicks = numberValue(row, ["clicks"]);
  const spend = numberValue(row, ["spend", "total_spent", "cost", "cost_in_local_currency", "cost_in_usd"]);
  const leads = numberValue(row, ["leads", "qualified_leads", "leads_work_email", "one_click_leads", "lead_form_opens", "conversions"]);
  const conversions = numberValue(row, ["conversions", "external_website_conversions"]);
  const ctr = impressions ? clicks / impressions : numberValue(row, ["ctr"], 0) / 100;
  const cpl = leads ? spend / leads : null;
  const variant = classifyCreativeVariant(row);

  return {
    row,
    name,
    targetUrn,
    status,
    dailyBudget,
    currencyCode,
    impressions,
    clicks,
    spend,
    leads,
    conversions,
    ctr,
    cpl,
    variant: variant.raw,
    variantKind: variant.kind,
    variantNormalized: variant.normalized
  };
}

// A Trust Gap candidate is a company-page creative that is spending real money,
// clearing low CTR, and not generating meaningful leads. The audience and
// spend make it a credible test — it's the credibility of the creative that is
// almost certainly broken. See OPERATOR-PLAYBOOK.md for the operator framing.
export function findTrustGapCandidates(campaigns = [], options = {}) {
  const spendFloor = options.spendFloor ?? HIGH_SPEND_NO_LEAD_THRESHOLD_USD;
  const ctrCeiling = options.ctrCeiling ?? LOW_CTR_TRUST_GAP_DECIMAL;
  const leadCeiling = options.leadCeiling ?? LOW_LEADS_TRUST_GAP_COUNT;

  return campaigns.filter((campaign) => {
    if (campaign.variantKind === "thought_leader") return false;
    const isCompanyPage = campaign.variantKind === "company_page" || campaign.variantKind === "unknown" || campaign.variantKind === "other";
    if (!isCompanyPage) return false;
    if (campaign.spend < spendFloor) return false;
    if (!(campaign.ctr >= 0 && campaign.ctr < ctrCeiling)) return false;
    if (campaign.leads >= leadCeiling) return false;
    return true;
  });
}

export function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${(value * 100).toFixed(2)}%`;
}
