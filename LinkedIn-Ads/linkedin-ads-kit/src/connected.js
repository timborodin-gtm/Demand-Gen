import path from "node:path";
import { linkedinApiVersion } from "./env.js";
import { writeJson } from "./files.js";
import { writeBrief } from "./brief.js";
import { accountUrn, LinkedInClient } from "./linkedin/client.js";
import { loadSelectedAccount, saveSelectedAccount, updateAccountMarkdown } from "./workspace.js";
import { normalizeCampaignUrn } from "./urns.js";

export async function runConnectedBrief({ brandContext, brandMemory, token, env = process.env, fetchImpl = globalThis.fetch, args = {}, date = new Date() }) {
  const connected = await pullConnectedData({ brandContext, brandMemory, token, env, fetchImpl, args, date });
  const result = await writeBrief({
    brandContext,
    brandMemory,
    source: "connected",
    inputData: connected.inputData,
    connectedMeta: connected.connectedMeta,
    date
  });

  return {
    ...result,
    cache: connected.cache,
    selected: connected.selected,
    warnings: connected.warnings
  };
}

export async function pullConnectedData({ brandContext, brandMemory, token, env = process.env, fetchImpl = globalThis.fetch, args = {}, date = new Date() }) {
  const apiVersion = linkedinApiVersion(env);
  const client = new LinkedInClient({
    accessToken: token.access_token,
    apiVersion,
    fetchImpl
  });

  const selected = await resolveAdAccount({ brandContext, brandMemory, env, client, args });
  const adAccountUrn = selected.urn || selected.accountUrn || accountUrn(selected.id || selected.accountId);

  const [campaignGroups, campaigns, creatives, analytics, leadFormsResult] = await Promise.all([
    safeApi(() => client.getCampaignGroups(adAccountUrn), "campaignGroups"),
    safeApi(() => client.getCampaigns(adAccountUrn), "campaigns"),
    safeApi(() => client.getCreatives(adAccountUrn), "creatives"),
    safeApi(() => client.getAnalytics({ adAccountUrn, startDate: args.start, endDate: args.end }), "analytics"),
    safeApi(() => client.getLeadForms(adAccountUrn), "leadForms")
  ]);
  const leadResponses = leadFormsResult.error
    ? { label: "leadFormResponses", data: null, error: "skipped because Lead Sync form access was unavailable" }
    : await fetchLeadResponses({ client, adAccountUrn, leadForms: leadFormsResult.data });

  const cache = {
    generatedAt: date.toISOString(),
    apiVersion,
    account: selected,
    campaignGroups,
    campaigns,
    creatives,
    analytics,
    leadForms: leadFormsResult,
    leadResponses
  };
  await writeJson(path.join(brandContext.paths.cache, "last-connected-pull.json"), cache);

  return {
    cache,
    selected,
    inputData: connectedCacheToInputData(cache),
    connectedMeta: {
      apiVersion,
      accountId: selected.id || selected.accountId,
      accountUrn: adAccountUrn,
      warnings: [campaignGroups, campaigns, creatives, analytics, leadFormsResult, leadResponses]
        .filter((item) => item.error)
        .map((item) => `${item.label}: ${item.error}`)
    },
    warnings: [campaignGroups, campaigns, creatives, analytics, leadFormsResult, leadResponses].filter((item) => item.error)
  };
}

export function connectedCacheToInputData(cache = {}) {
  return {
    campaignRows: campaignsToRows(cache.campaigns?.data, cache.analytics?.data),
    leadRows: [
      ...leadFormsToRows(cache.leadForms?.data),
      ...leadResponsesToRows(cache.leadResponses?.data)
    ],
    crmRows: []
  };
}

async function resolveAdAccount({ brandContext, brandMemory, env, client, args }) {
  const explicit = args.account || args.ad_account || env.LINKEDIN_AD_ACCOUNT_ID || brandMemory.stack?.linkedinAdAccountId || brandMemory.stack?.linkedinAdAccountUrn;
  if (explicit) {
    const selected = {
      id: String(explicit).replace(/^urn:li:sponsoredAccount:/, ""),
      urn: accountUrn(explicit),
      name: "Configured account"
    };
    await saveSelectedAccount(brandContext, selected);
    await updateAccountMarkdown(brandContext, selected);
    return selected;
  }

  const cached = await loadSelectedAccount(brandContext);
  if (cached?.id || cached?.urn) return cached;

  const accounts = await client.getAdAccounts();
  const elements = elementsOf(accounts);
  if (!elements.length) {
    throw new Error("No LinkedIn ad accounts returned for this token.");
  }

  const selected = normalizeAccount(elements[0]);
  await saveSelectedAccount(brandContext, selected);
  await updateAccountMarkdown(brandContext, selected);
  return selected;
}

async function safeApi(fn, label) {
  try {
    return { label, data: await fn(), error: null };
  } catch (error) {
    return { label, data: null, error: error.message };
  }
}

function campaignsToRows(campaignResponse, analyticsResponse) {
  const campaigns = elementsOf(campaignResponse);
  const analyticsByCampaign = new Map();

  for (const row of elementsOf(analyticsResponse)) {
    const pivot = row.pivotValues?.[0];
    if (pivot) analyticsByCampaign.set(pivot, row);
  }

  return campaigns.map((campaign, index) => {
    const rawCampaignId = campaign.id || campaign.urn || campaign.campaign || `connected-campaign-${index + 1}`;
    const campaignUrn = normalizeCampaignUrn(rawCampaignId);
    const analytics = analyticsByCampaign.get(campaignUrn) || analyticsByCampaign.get(String(rawCampaignId)) || {};
    return {
      campaign_name: campaign.name || campaign.localizedName || campaign.runSchedule?.name || `Campaign ${index + 1}`,
      campaign_urn: campaignUrn,
      status: campaign.status || campaign.intendedStatus || "",
      daily_budget: campaign.dailyBudget?.amount || campaign.dailyBudget || "",
      currency_code: campaign.dailyBudget?.currencyCode || "",
      impressions: analytics.impressions || 0,
      clicks: analytics.clicks || 0,
      spend: analytics.costInLocalCurrency || analytics.costInUsd || 0,
      leads: analytics.oneClickLeads || analytics.externalWebsiteConversions || 0,
      conversions: analytics.externalWebsiteConversions || 0
    };
  });
}

function leadFormsToRows(leadFormsResponse) {
  return elementsOf(leadFormsResponse).map((form) => ({
    form_name: form.name || form.content?.name || form.id || "Lead form",
    status: form.status || "",
    fields: JSON.stringify(form.content?.questions || form.formResponse || [])
  }));
}

async function fetchLeadResponses({ client, adAccountUrn, leadForms }) {
  const forms = elementsOf(leadForms).slice(0, 10);
  const responses = [];
  const errors = [];

  for (const form of forms) {
    const versionedLeadGenFormUrn = form.versionedLeadGenFormUrn || form.versionedForm || form.id;
    if (!versionedLeadGenFormUrn) continue;

    try {
      const response = await client.getLeadFormResponses({ ownerUrn: adAccountUrn, versionedLeadGenFormUrn });
      responses.push({ form: versionedLeadGenFormUrn, response });
    } catch (error) {
      errors.push(`${versionedLeadGenFormUrn}: ${error.message}`);
    }
  }

  return {
    label: "leadFormResponses",
    data: responses,
    error: errors.length ? errors.join("; ") : null
  };
}

function leadResponsesToRows(leadResponses) {
  const rows = [];
  for (const item of leadResponses || []) {
    for (const response of elementsOf(item.response)) {
      const campaign = response.leadMetadataInfo?.sponsoredLeadMetadataInfo?.campaign || {};
      const campaignId = response.leadMetadata?.sponsoredLeadMetadata?.campaign || campaign.id || "";
      const creative = response.associatedEntityInfo?.associatedCreative || {};
      const creativeId = response.associatedEntity?.associatedCreative || creative.id || "";
      rows.push({
        form_name: item.form,
        status: response.testLead ? "test" : "submitted",
        test_lead: response.testLead ? "TRUE" : "FALSE",
        lead_type: response.leadType || "",
        submitted_at: response.submittedAt || "",
        campaign: campaign.name || campaignId,
        campaign_id: campaignId,
        ad_id: creativeId,
        form_response: JSON.stringify(response.formResponse || {})
      });
    }
  }
  return rows;
}

function elementsOf(response) {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.elements)) return response.elements;
  if (response.results && typeof response.results === "object") return Object.values(response.results);
  return [];
}

function normalizeAccount(account) {
  const id = String(account.id || account.account || account.accountId || "").replace(/^urn:li:sponsoredAccount:/, "");
  return {
    id,
    urn: account.urn || account.accountUrn || accountIdToUrn(id),
    name: account.name || account.localizedName || account.reference || "LinkedIn Ad Account"
  };
}

function accountIdToUrn(id) {
  return String(id).startsWith("urn:li:sponsoredAccount:") ? id : `urn:li:sponsoredAccount:${id}`;
}

