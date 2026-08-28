// URN helpers shared across the LinkedIn Ads Kit.
//
// Design decision: accountId() and accountUrn() are also exported from
// src/linkedin/client.js (where they serve the HTTP layer). Rather than
// making client.js import from here — which would invert the dependency
// direction — those two helpers are co-located in client.js for the HTTP
// layer and re-exported from this module for the rest of the codebase.
// The implementations are identical; any future change must be applied in
// both places, or client.js can be updated to re-export from here once a
// broader refactor is warranted.

/**
 * Normalises a value to a full urn:li:sponsoredAccount URN.
 * - Already a URN → returned as-is.
 * - Bare numeric id → prefixed.
 * - Empty string → returned as-is.
 * - Any other string → returned as-is (caller decides).
 */
export function normalizeSponsoredAccountUrn(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("urn:li:sponsoredAccount:")) return raw;
  if (/^\d+$/.test(raw)) return `urn:li:sponsoredAccount:${raw}`;
  return raw;
}

/**
 * Normalises a value to a full urn:li:sponsoredCampaign URN.
 * - Already a URN → returned as-is.
 * - Bare numeric id → prefixed.
 * - Empty string → returned as-is.
 * - Any other string → returned as-is.
 */
export function normalizeCampaignUrn(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("urn:li:sponsoredCampaign:")) return raw;
  if (/^\d+$/.test(raw)) return `urn:li:sponsoredCampaign:${raw}`;
  return raw;
}

/**
 * Extracts the numeric account id from a URN or returns the raw value.
 * Mirrors the implementation in src/linkedin/client.js.
 */
export function accountId(adAccountUrnOrId) {
  const value = String(adAccountUrnOrId || "");
  const match = /urn:li:sponsoredAccount:(\d+)/.exec(value);
  return match ? match[1] : value;
}

/**
 * Converts a raw id or URN to a full urn:li:sponsoredAccount URN.
 * Mirrors the implementation in src/linkedin/client.js.
 */
export function accountUrn(adAccountUrnOrId) {
  const value = String(adAccountUrnOrId || "");
  if (value.startsWith("urn:li:sponsoredAccount:")) return value;
  return `urn:li:sponsoredAccount:${value}`;
}

/** Returns true when value is (or looks like) a sponsoredAccount URN. */
export function isSponsoredAccountUrn(value) {
  return String(value || "").startsWith("urn:li:sponsoredAccount:");
}

/** Returns true when value is (or looks like) a sponsoredCampaign URN. */
export function isCampaignUrn(value) {
  return String(value || "").startsWith("urn:li:sponsoredCampaign:");
}
