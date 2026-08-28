import path from "node:path";
import { fileStamp } from "./dates.js";
import { analyzeInputs, loadExportInputs, trustGapLines } from "./brief.js";
import { pullConnectedData, connectedCacheToInputData } from "./connected.js";
import { sanitizeCellForMarkdown } from "./csv.js";
import { readJsonIfExists, writeText } from "./files.js";
import { appendLearning, fencedBrandMemorySections } from "./workspace.js";
import { formatMoney, formatPercent, HIGH_SPEND_NO_LEAD_THRESHOLD_USD } from "./metrics.js";
import { linkedinApiVersion } from "./env.js";
import { UNTRUSTED_BANNER } from "./untrusted.js";

export async function runDailyBrief({
  brandContext,
  brandMemory,
  env = process.env,
  fetchImpl = globalThis.fetch,
  args = {},
  token = null,
  date = new Date()
}) {
  const data = await resolveDailyData({ brandContext, brandMemory, env, fetchImpl, args, token, date });
  const analysis = analyzeInputs(data.inputData, brandMemory);
  const markdown = renderDailyBrief({
    brandContext,
    brandMemory: brandMemory || {},
    source: data.source,
    modeNote: data.modeNote,
    analysis,
    inputData: data.inputData,
    connectedMeta: data.connectedMeta,
    warnings: data.warnings,
    date
  });
  const briefPath = path.join(brandContext.paths.briefs, `${fileStamp(date)}-daily-brief.md`);

  await writeText(briefPath, markdown);
  await appendLearning(
    brandContext,
    `Generated daily brief. Source: ${data.source}. Spend: ${formatMoney(analysis.campaigns.totals.spend)}. Leads: ${analysis.campaigns.totals.leads}. Qualified lead signal: ${analysis.leads.qualified}/${analysis.leads.total}.`
  );

  return {
    briefPath,
    markdown,
    analysis,
    source: data.source,
    warnings: data.warnings
  };
}

async function resolveDailyData({ brandContext, brandMemory, env, fetchImpl, args, token, date }) {
  if (args.campaigns || args.leads || args.crm) {
    return {
      source: "export",
      modeNote: "Read-only daily brief from supplied LinkedIn/CRM exports.",
      inputData: await loadExportInputs(args),
      connectedMeta: {
        apiVersion: linkedinApiVersion(env),
        accountId: args.account || env.LINKEDIN_AD_ACCOUNT_ID || brandMemory.stack?.linkedinAdAccountId || ""
      },
      warnings: []
    };
  }

  if (args.connected !== false && args.connected !== "false" && token?.access_token) {
    const connected = await pullConnectedData({ brandContext, brandMemory, token, env, fetchImpl, args, date });
    return {
      source: "connected",
      modeNote: "Read-only daily brief from a fresh LinkedIn Marketing API pull.",
      inputData: connected.inputData,
      connectedMeta: connected.connectedMeta,
      warnings: connected.warnings
    };
  }

  const cache = await readJsonIfExists(path.join(brandContext.paths.cache, "last-connected-pull.json"), null);
  if (cache) {
    return {
      source: "cache",
      modeNote: "Read-only daily brief from the latest connected cache. Run connected mode for fresher current values.",
      inputData: connectedCacheToInputData(cache),
      connectedMeta: {
        apiVersion: cache.apiVersion || linkedinApiVersion(env),
        accountId: cache.account?.id || "",
        accountUrn: cache.account?.urn || "",
        generatedAt: cache.generatedAt
      },
      warnings: [cache.campaignGroups, cache.campaigns, cache.creatives, cache.analytics, cache.leadForms, cache.leadResponses]
        .filter((item) => item?.error)
        .map((item) => ({ label: item.label || "cache", error: item.error }))
    };
  }

  throw new Error("Daily brief needs either CSV exports, a connected LinkedIn token, or a previous connected cache. Try: npm run daily:brief -- --campaigns campaigns.csv --leads leads.csv --crm crm.csv");
}

function renderDailyBrief({ brandContext, brandMemory, source, modeNote, analysis, inputData, connectedMeta, warnings, date }) {
  const totals = analysis.campaigns.totals;
  const confidence = confidenceLabel({ inputData, source, analysis });
  const fakeSignals = fakeSignalLines(analysis);
  const realSignals = realSignalLines(analysis);
  const trustGap = trustGapLines(analysis);
  const leaks = leakLines(analysis, inputData);
  const moves = todayMoveLines(analysis);
  const avoid = doNotTouchLines(analysis, inputData);
  const gaps = dataGapLines(analysis, inputData, warnings);
  const trustGapSection = trustGap.length
    ? `\n## Trust Gap\n\n${formatBulletList(trustGap)}\n`
    : "";
  const brandMemoryBlock = brandMemory ? renderBrandMemoryBlock(brandMemory) : "";

  return `# LinkedIn Ads Daily Brief

${UNTRUSTED_BANNER}

Brand: ${brandContext.brand}
Source: ${source}
Confidence: ${confidence}
Generated: ${date.toISOString()}

${modeNote}

This brief is read-only. It can guide daily management without applying changes. Use \`npm run draft\` and \`npm run apply\` only after you decide a recommendation deserves action.

## The 5 Daily LinkedIn Ads Questions

1. Are we buying real buyers?
2. What is creating fake confidence?
3. Where is the leak between ad, form, and sales?
4. What should we do next?
5. What should we avoid touching yet?

## Snapshot

- Spend reviewed: ${formatMoney(totals.spend)}
- Impressions: ${totals.impressions.toLocaleString("en-US")}
- Clicks: ${totals.clicks.toLocaleString("en-US")}
- Leads: ${totals.leads.toLocaleString("en-US")}
- CTR: ${formatPercent(totals.ctr)}
- CPL: ${totals.cpl === null ? "n/a" : formatMoney(totals.cpl)}
- Qualified lead signal: ${analysis.leads.qualified}/${analysis.leads.total}
- API version: ${connectedMeta.apiVersion || "n/a"}
- Ad account: ${connectedMeta.accountUrn || connectedMeta.accountId || "n/a"}

## Real Signal

${formatBulletList(realSignals)}

## Fake Signal

${formatBulletList(fakeSignals)}
${trustGapSection}
## Leaks

${formatBulletList(leaks)}

## Today's Moves

${formatBulletList(moves)}

## Do Not Touch Yet

${formatBulletList(avoid)}

## Data Gaps

${formatBulletList(gaps)}

## Brand Memory (Untrusted)

${brandMemoryBlock}
`;
}

function renderBrandMemoryBlock(brandMemory) {
  const sections = fencedBrandMemorySections(brandMemory);
  return sections.map((section) => section.fenced).join("\n\n");
}

function confidenceLabel({ inputData, source, analysis }) {
  const hasCampaigns = inputData.campaignRows.length > 0;
  const hasLeadOrCrm = inputData.leadRows.length + inputData.crmRows.length > 0;

  if (source === "connected" && hasCampaigns && hasLeadOrCrm && analysis.leads.qualified + analysis.leads.disqualified > 0) return "HIGH";
  if (hasCampaigns && hasLeadOrCrm) return "MEDIUM";
  if (hasCampaigns) return "LOW - media-only";
  return "LOW - missing campaign data";
}

function realSignalLines(analysis) {
  const lines = [];
  const totals = analysis.campaigns.totals;
  const campaignsWithLeads = analysis.campaigns.campaigns
    .filter((campaign) => campaign.leads > 0)
    .sort((left, right) => right.leads - left.leads || left.cpl - right.cpl)
    .slice(0, 3);

  if (analysis.leads.qualified > 0) {
    lines.push(`${analysis.leads.qualified} qualified lead signal(s) detected from ${analysis.leads.total} lead/CRM row(s). Manage toward those patterns, not total form fills.`);
  }

  for (const campaign of campaignsWithLeads) {
    lines.push(`${sanitizeCellForMarkdown(campaign.name)} produced ${campaign.leads} lead(s) at ${campaign.cpl === null ? "n/a CPL" : `${formatMoney(campaign.cpl)} CPL`}. Check whether these leads match the ICP before scaling.`);
  }

  if (!lines.length && totals.leads > 0) {
    lines.push(`${totals.leads} lead(s) exist, but the brief cannot yet prove buyer quality. Match the leads to CRM stage, company fit, and sales notes.`);
  }

  if (!lines.length) {
    lines.push("No real buyer signal is visible from the available data yet. That does not mean the account failed; it means the next management step is better lead/CRM evidence.");
  }

  return lines;
}

function fakeSignalLines(analysis) {
  const lines = [];
  const highSpendNoLead = highSpendNoLeadCampaigns(analysis).slice(0, 3);
  const lowQualifiedRate = analysis.leads.total > 0 && analysis.leads.qualifiedRate < 0.2;
  const lowCtr = analysis.campaigns.campaigns.filter((campaign) => campaign.impressions >= 1000 && campaign.ctr < 0.0035).slice(0, 3);

  for (const campaign of highSpendNoLead) {
    lines.push(`${sanitizeCellForMarkdown(campaign.name)} spent ${formatMoney(campaign.spend)} with no lead signal. If tracking is healthy and the campaign is current, this is a pause or rewrite candidate.`);
  }

  if (lowQualifiedRate) {
    lines.push(`Lead volume is not translating into qualified signal (${analysis.leads.qualified}/${analysis.leads.total}). Do not celebrate cheap CPL until sales quality improves.`);
  }

  for (const campaign of lowCtr) {
    lines.push(`${sanitizeCellForMarkdown(campaign.name)} has weak CTR (${formatPercent(campaign.ctr)}). This usually points to audience, pain, proof, or offer mismatch.`);
  }

  if (!lines.length) {
    lines.push("No obvious fake-signal pattern from the available rows. Keep watching buyer quality before making budget calls.");
  }

  return lines;
}

function leakLines(analysis, inputData) {
  const lines = [];

  if (inputData.leadRows.length + inputData.crmRows.length === 0) {
    lines.push("No lead or CRM data was provided. The biggest leak is measurement: the kit can see media performance, but not buyer quality.");
  }

  if (analysis.leads.disqualified > analysis.leads.qualified) {
    lines.push(`Disqualified leads outnumber qualified leads (${analysis.leads.disqualified} vs ${analysis.leads.qualified}). Add qualification friction or tighten the offer before scaling.`);
  }

  const missing = missingHandoffFields(analysis);
  if (missing.length) {
    lines.push(`Sales handoff is missing useful fields: ${missing.join(", ")}. Add hidden fields or export settings so reps know what conversation the ad started.`);
  }

  if (analysis.leads.customFields.length) {
    lines.push(`Custom questions / hidden fields are present. Preserve them in CRM because they may explain quality better than LinkedIn CPL.`);
  }

  if (!lines.length) {
    lines.push("No obvious handoff leak from the available lead fields. Keep checking whether sales can see campaign, offer, and form context.");
  }

  return lines;
}

function todayMoveLines(analysis) {
  const lines = [];
  const highSpendNoLead = highSpendNoLeadCampaigns(analysis).slice(0, 2);
  const lowCtr = analysis.campaigns.campaigns.find((campaign) => campaign.impressions >= 1000 && campaign.ctr < 0.0035);

  for (const campaign of highSpendNoLead) {
    const prefix = campaign.targetUrn ? "[draft-ready]" : "[manual]";
    lines.push(`${prefix} Review ${sanitizeCellForMarkdown(campaign.name)}. If current status is still active and tracking is healthy, draft a pause or budget reduction.`);
  }

  if (analysis.leads.disqualified > analysis.leads.qualified) {
    lines.push("[manual] Add one qualification question or tighten the lead form promise before increasing budget.");
  }

  if (lowCtr) {
    lines.push(`[manual] Rewrite ${sanitizeCellForMarkdown(lowCtr.name)} around a sharper buyer pain, proof point, or cost-of-inaction hook.`);
  }

  lines.push("[manual] Score 3-5 candidate founder/operator posts for Thought Leader Ads before launching another company-page test.");

  return lines;
}

function doNotTouchLines(analysis, inputData) {
  const lines = [];
  const lowSpend = analysis.campaigns.campaigns.filter((campaign) => campaign.spend > 0 && campaign.spend < 100);

  if (inputData.leadRows.length + inputData.crmRows.length === 0) {
    lines.push("Do not make major budget decisions from media metrics alone. Add lead or CRM quality first.");
  }

  if (analysis.leads.qualified > 0) {
    lines.push("Do not cut campaigns with qualified downstream signal just because CPL is not pretty. Confirm quality and sales notes first.");
  }

  if (lowSpend.length) {
    lines.push(`${lowSpend.length} campaign(s) have spend below $100. Do not overreact to thin data unless there is a clear tracking or targeting issue.`);
  }

  if (!lines.length) {
    lines.push("Do not make live changes from the daily brief alone. Draft, dry run, and validate current values first.");
  }

  return lines;
}

function dataGapLines(analysis, inputData, warnings = []) {
  const lines = [];

  if (!inputData.campaignRows.length) lines.push("Campaign export/API campaign rows are missing.");
  if (!inputData.leadRows.length) lines.push("Lead form responses are missing. Use Lead Sync if available or export lead forms manually.");
  if (!inputData.crmRows.length) lines.push("CRM/sales outcome rows are missing. Add sales accepted, opportunity, closed won, or rejection notes.");

  for (const warning of warnings) {
    lines.push(`${warning.label}: ${warning.error}`);
  }

  if (!analysis.leads.campaigns.length && analysis.leads.total > 0) {
    lines.push("Lead rows do not include campaign/ad context. Add campaign, ad, form, or UTM fields for daily management.");
  }

  if (!lines.length) {
    lines.push("No critical data gaps from the available rows.");
  }

  return lines;
}

function highSpendNoLeadCampaigns(analysis) {
  return analysis.campaigns.campaigns
    .filter((campaign) => campaign.spend >= HIGH_SPEND_NO_LEAD_THRESHOLD_USD && campaign.leads === 0)
    .sort((left, right) => right.spend - left.spend);
}

function missingHandoffFields(analysis) {
  if (analysis.leads.total === 0) return [];

  return analysis.leads.fieldCoverage
    .filter((field) => ["workEmail", "companyName", "jobTitle", "campaign", "adId"].includes(field.field))
    .filter((field) => field.count === 0)
    .map((field) => field.label);
}

function formatBulletList(lines) {
  return lines.map((line) => `- ${line}`).join("\n");
}
