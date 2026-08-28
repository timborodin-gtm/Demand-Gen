import { normalizeHeader } from "./csv.js";

const FIELD_DEFINITIONS = [
  { key: "leadId", label: "Lead ID", aliases: ["id", "response id", "adform response id", "lead gen form response id", "lead form response id"] },
  { key: "firstName", label: "First Name", aliases: ["first", "firstname", "given name"] },
  { key: "lastName", label: "Last Name", aliases: ["last", "lastname", "family name", "surname"] },
  { key: "email", label: "Email Address", aliases: ["email", "email address", "personal email", "personal email address"] },
  { key: "workEmail", label: "Work Email", aliases: ["work email address", "business email", "business email address", "corporate email"] },
  { key: "phone", label: "Phone", aliases: ["phone number", "personal phone", "personal phone number", "work phone", "work phone number"] },
  { key: "companyName", label: "Company Name", aliases: ["company", "organization", "organisation", "account name"] },
  { key: "jobTitle", label: "Job Title", aliases: ["title", "position", "role", "current job title"] },
  { key: "companySize", label: "Company Size", aliases: ["company headcount", "employee count", "employees", "headcount"] },
  { key: "country", label: "Country", aliases: ["country/region", "country region", "location"] },
  { key: "industry", label: "Industry", aliases: ["company industry", "member industry"] },
  { key: "seniority", label: "Seniority", aliases: ["job seniority", "seniority level"] },
  { key: "campaign", label: "Campaign", aliases: ["campaign name", "campaign_name", "ad campaign"] },
  { key: "campaignId", label: "Campaign ID", aliases: ["campaign urn", "campaign_urn", "sponsored campaign"] },
  { key: "adId", label: "Ad ID", aliases: ["creative id", "creative_id", "sponsored creative", "ad creative id"] },
  { key: "adSetId", label: "Ad Set ID", aliases: ["adset id", "ad set", "campaign group id", "campaign group", "campaign_group_id"] },
  { key: "formName", label: "Form Name", aliases: ["lead form", "lead form name", "lead gen form", "lead gen form name", "form"] },
  { key: "submittedAt", label: "Submitted At", aliases: ["submitted", "submission time", "submitted time", "date submitted", "created at", "created time"] },
  { key: "testLead", label: "Test Lead", aliases: ["is test lead", "test", "test_lead"] },
  { key: "status", label: "Status", aliases: ["lead status", "qualification status", "crm stage", "stage", "sales status", "lifecycle stage"] },
  { key: "notes", label: "Notes", aliases: ["sales notes", "crm notes", "comment", "comments", "reason"] }
];

const COVERAGE_FIELDS = [
  "email",
  "workEmail",
  "phone",
  "companyName",
  "jobTitle",
  "companySize",
  "campaign",
  "campaignId",
  "adId",
  "adSetId",
  "formName",
  "submittedAt",
  "testLead"
];

const QUALITY_POSITIVE = /\b(qualified|sales accepted|opportunity|demo booked|booked demo|meeting booked|customer|closed won|sql|pipeline)\b/i;
const QUALITY_NEGATIVE = /\b(disqualified|unqualified|student|competitor|spam|bad fit|junk|no budget|no authority|invalid)\b/i;

const DEFINITIONS_BY_KEY = new Map(FIELD_DEFINITIONS.map((definition) => [definition.key, definition]));

export function summarizeLeadRows(rows = []) {
  const normalizedRows = rows.map((row, index) => normalizeLeadRow(row, index));
  const coverage = Object.fromEntries(COVERAGE_FIELDS.map((field) => [field, 0]));
  const customFields = new Map();
  const campaigns = new Map();
  let qualified = 0;
  let disqualified = 0;
  let unknown = 0;
  let testLeads = 0;
  let testLeadKnown = 0;

  for (const row of normalizedRows) {
    if (row.quality === "qualified") qualified += 1;
    if (row.quality === "disqualified") disqualified += 1;
    if (row.quality === "unknown") unknown += 1;

    for (const field of COVERAGE_FIELDS) {
      if (hasValue(row.fields[field])) coverage[field] += 1;
    }

    if (hasValue(row.fields.testLead)) {
      testLeadKnown += 1;
      if (truthy(row.fields.testLead)) testLeads += 1;
    }

    const campaign = row.fields.campaign || row.fields.campaignId;
    if (hasValue(campaign)) increment(campaigns, campaign);

    for (const [key, value] of Object.entries(row.customFields)) {
      if (!hasValue(value)) continue;
      const existing = customFields.get(key) || { key, label: prettifyHeader(key), count: 0, examples: [] };
      existing.count += 1;
      if (existing.examples.length < 3 && !existing.examples.includes(value)) existing.examples.push(value);
      customFields.set(key, existing);
    }
  }

  const total = normalizedRows.length;
  return {
    total,
    qualified,
    disqualified,
    unknown,
    qualifiedRate: total ? qualified / total : 0,
    testLeads,
    testLeadKnown,
    fieldCoverage: COVERAGE_FIELDS.map((field) => ({
      field,
      label: DEFINITIONS_BY_KEY.get(field)?.label || prettifyHeader(field),
      count: coverage[field],
      rate: total ? coverage[field] / total : 0
    })),
    campaigns: sortedCounts(campaigns).slice(0, 5),
    customFields: Array.from(customFields.values()).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
    rows: normalizedRows
  };
}

export function normalizeLeadRow(row = {}, index = 0) {
  const normalizedRow = normalizeObjectKeys(row);
  const mappedKeys = new Set();
  const fields = {};

  for (const definition of FIELD_DEFINITIONS) {
    const match = firstValue(normalizedRow, definition);
    fields[definition.key] = match.value;
    if (match.key) mappedKeys.add(match.key);
  }

  const customFields = {};
  for (const [key, value] of Object.entries(normalizedRow)) {
    if (!mappedKeys.has(normalizeHeader(key)) && hasValue(value)) {
      customFields[normalizeHeader(key)] = String(value).trim();
    }
  }

  return {
    index,
    row,
    fields,
    customFields,
    quality: classifyLead({ row, fields })
  };
}

function firstValue(row, definition) {
  const aliases = normalizedAliases(definition);
  for (const alias of aliases) {
    if (row[alias] !== undefined && hasValue(row[alias])) {
      return { key: alias, value: String(row[alias]).trim() };
    }
  }
  return { key: "", value: "" };
}

function normalizeObjectKeys(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    normalized[normalizeHeader(key)] = value;
  }
  return normalized;
}

function normalizedAliases(definition) {
  return new Set([
    definition.key,
    definition.label,
    ...(definition.aliases || [])
  ].map(normalizeHeader));
}

function classifyLead({ row, fields }) {
  const outcomeValues = Object.entries(row)
    .filter(([key]) => /status|stage|note|qualif|outcome|fit|reason/i.test(normalizeHeader(key)))
    .map(([, value]) => value);
  const qualityText = [
    fields.status,
    fields.notes,
    ...outcomeValues
  ].join(" ");

  if (QUALITY_NEGATIVE.test(qualityText)) return "disqualified";
  if (QUALITY_POSITIVE.test(qualityText)) return "qualified";
  return "unknown";
}

function hasValue(value) {
  return String(value ?? "").trim() !== "";
}

function truthy(value) {
  return /^(true|yes|1)$/i.test(String(value || "").trim());
}

function increment(map, key) {
  const normalized = String(key || "").trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function sortedCounts(map) {
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function prettifyHeader(header) {
  return String(header || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bUtm\b/g, "UTM")
    .replace(/\bId\b/g, "ID")
    .replace(/\bCrm\b/g, "CRM");
}
