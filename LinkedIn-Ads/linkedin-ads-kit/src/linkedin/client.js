// LinkedIn REST client.
//
// Note on `getCreatives` fallback: LinkedIn's creative API exposes two shapes
// depending on account type / API version. Older/standard accounts respond to
// `q=criteria`; newer accounts (and some API versions) require `q=search`.
// When the first call fails with the specific version-mismatch signature, we
// retry with the alternate query param. Any other 400/404 (permission denied,
// bad account, etc.) surfaces the original error unchanged.
import { linkedinApiVersion } from "../env.js";

export const REQUEST_TIMEOUT_MS = 30_000;

// Signature LinkedIn returns when the `q` param is wrong for this account
// shape. Matches common phrasings across API versions. Case-insensitive.
const CREATIVE_QUERY_MISMATCH_RE =
  /(unknown|invalid|unsupported)\s+(finder|query|q\s*param)|finder\s+'?criteria'?\s+(is\s+)?(not|un)/i;

export class LinkedInApiError extends Error {
  constructor(message, { status, body, url }) {
    super(message);
    this.name = "LinkedInApiError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

export class LinkedInClient {
  constructor({ accessToken, apiVersion, fetchImpl = globalThis.fetch, baseUrl = "https://api.linkedin.com", timeoutMs = REQUEST_TIMEOUT_MS }) {
    if (!accessToken) throw new Error("LinkedInClient requires an access token.");
    if (!fetchImpl) throw new Error("LinkedInClient requires fetch. Use Node 20+.");

    this.accessToken = accessToken;
    this.apiVersion = apiVersion || linkedinApiVersion();
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  async request(resourcePath, options = {}) {
    const url = new URL(resourcePath.startsWith("http") ? resourcePath : `${this.baseUrl}${resourcePath}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      "Linkedin-Version": this.apiVersion,
      "X-Restli-Protocol-Version": "2.0.0",
      ...(options.headers || {})
    };

    let body;
    if (options.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetch(url, {
        method: options.method || "GET",
        headers,
        body,
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted || error?.name === "AbortError") {
        throw new LinkedInApiError(`LinkedIn API request timed out after ${this.timeoutMs}ms`, {
          status: undefined,
          body: null,
          url: url.toString()
        });
      }
      throw error;
    }
    clearTimeout(timer);

    const text = await response.text();
    const parsed = parseMaybeJson(text);

    if (!response.ok) {
      throw new LinkedInApiError(`LinkedIn API ${response.status} for ${url.pathname}`, {
        status: response.status,
        body: parsed,
        url: url.toString()
      });
    }

    return parsed ?? { status: response.status, headers: headersToObject(response.headers) };
  }

  async getAdAccounts() {
    return this.request("/rest/adAccounts", {
      query: {
        q: "search",
        pageSize: 100
      }
    });
  }

  async getCampaignGroups(adAccountUrnOrId) {
    return this.request(`/rest/adAccounts/${accountId(adAccountUrnOrId)}/adCampaignGroups`, {
      query: { q: "search", pageSize: 100 }
    });
  }

  async getCampaigns(adAccountUrnOrId) {
    return this.request(`/rest/adAccounts/${accountId(adAccountUrnOrId)}/adCampaigns`, {
      query: { q: "search", pageSize: 100 }
    });
  }

  async getCampaign(adAccountUrnOrId, campaignUrn) {
    return this.request(`/rest/adAccounts/${accountId(adAccountUrnOrId)}/adCampaigns/${encodeURIComponent(campaignUrn)}`);
  }

  async getCreatives(adAccountUrnOrId) {
    try {
      return await this.request(`/rest/adAccounts/${accountId(adAccountUrnOrId)}/creatives`, {
        query: { q: "criteria", pageSize: 100 }
      });
    } catch (error) {
      if (!isCreativeQueryMismatch(error)) {
        throw error;
      }
      try {
        return await this.request(`/rest/adAccounts/${accountId(adAccountUrnOrId)}/creatives`, {
          query: { q: "search", pageSize: 100 }
        });
      } catch (retryError) {
        // If the fallback shape also fails, surface the ORIGINAL error so the
        // caller sees the primary failure, not the fallback's 400.
        throw error;
      }
    }
  }

  async getCreative(adAccountUrnOrId, creativeUrn) {
    return this.request(`/rest/adAccounts/${accountId(adAccountUrnOrId)}/creatives/${encodeURIComponent(creativeUrn)}`);
  }

  async getAnalytics({ adAccountUrn, startDate, endDate, pivot = "CAMPAIGN" }) {
    const dateRange = buildDateRange(startDate, endDate);
    return this.request("/rest/adAnalytics", {
      query: {
        q: "analytics",
        pivot,
        timeGranularity: "ALL",
        dateRange,
        accounts: `List(${encodeURIComponent(adAccountUrn)})`,
        fields: "impressions,clicks,costInLocalCurrency,externalWebsiteConversions,oneClickLeads,dateRange,pivotValues"
      }
    });
  }

  async getLeadForms(ownerUrn) {
    return this.request("/rest/leadForms", {
      query: {
        q: "owner",
        owner: `(sponsoredAccount:${ownerUrn})`,
        count: 100
      }
    });
  }

  async getLeadFormResponses({ ownerUrn, versionedLeadGenFormUrn }) {
    return this.request("/rest/leadFormResponses", {
      query: {
        q: "owner",
        owner: `(sponsoredAccount:${ownerUrn})`,
        leadType: "(leadType:SPONSORED)",
        limitedToTestLeads: "false",
        versionedLeadGenFormUrn
      }
    });
  }

  async patchCampaign(adAccountUrnOrId, campaignUrn, fields) {
    return this.request(`/rest/adAccounts/${accountId(adAccountUrnOrId)}/adCampaigns/${encodeURIComponent(campaignUrn)}`, {
      method: "POST",
      headers: { "X-RestLi-Method": "PARTIAL_UPDATE" },
      body: { patch: { $set: fields } }
    });
  }

  async patchCreative(adAccountUrnOrId, creativeUrn, fields) {
    return this.request(`/rest/adAccounts/${accountId(adAccountUrnOrId)}/creatives/${encodeURIComponent(creativeUrn)}`, {
      method: "POST",
      headers: { "X-RestLi-Method": "PARTIAL_UPDATE" },
      body: { patch: { $set: fields } }
    });
  }

  async createCreativeFromExistingPost({ adAccountUrn, campaignUrn, postUrn, intendedStatus = "DRAFT" }) {
    return this.request(`/rest/adAccounts/${accountId(adAccountUrn)}/creatives`, {
      method: "POST",
      body: {
        content: {
          reference: postUrn
        },
        campaign: campaignUrn,
        intendedStatus
      }
    });
  }
}

export function accountId(adAccountUrnOrId) {
  const value = String(adAccountUrnOrId || "");
  const match = /urn:li:sponsoredAccount:(\d+)/.exec(value);
  return match ? match[1] : value;
}

export function accountUrn(adAccountUrnOrId) {
  const value = String(adAccountUrnOrId || "");
  if (value.startsWith("urn:li:sponsoredAccount:")) return value;
  return `urn:li:sponsoredAccount:${value}`;
}

function isCreativeQueryMismatch(error) {
  if (!(error instanceof LinkedInApiError)) return false;
  if (![400, 404].includes(error.status)) return false;
  const haystack = errorBodyText(error.body);
  if (!haystack) return false;
  return CREATIVE_QUERY_MISMATCH_RE.test(haystack);
}

function errorBodyText(body) {
  if (!body) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return "";
  }
}

function buildDateRange(startDate, endDate) {
  const start = parseDateParts(startDate || daysAgo(30));
  const end = parseDateParts(endDate || new Date());
  return `(start:(year:${start.year},month:${start.month},day:${start.day}),end:(year:${end.year},month:${end.month},day:${end.day}))`;
}

function parseDateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function daysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function parseMaybeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function headersToObject(headers) {
  const output = {};
  if (!headers?.forEach) return output;
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}
