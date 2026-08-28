import path from "node:path";
import { fileStamp } from "./dates.js";
import { loadCsv, sanitizeCellForMarkdown } from "./csv.js";
import { writeText } from "./files.js";
import { appendLearning, fencedBrandMemorySections } from "./workspace.js";
import { formatMoney, formatPercent, HIGH_SPEND_NO_LEAD_THRESHOLD_USD, summarizeCampaignRows, summarizeLeadRows } from "./metrics.js";
import { buildDraftMarkdown } from "./draft.js";
import { normalizeSponsoredAccountUrn } from "./urns.js";
import { UNTRUSTED_BANNER } from "./untrusted.js";

export async function loadExportInputs(args) {
  const [campaignRows, leadRows, crmRows] = await Promise.all([
    args.campaigns ? loadCsv(args.campaigns) : Promise.resolve([]),
    args.leads ? loadCsv(args.leads) : Promise.resolve([]),
    args.crm ? loadCsv(args.crm) : Promise.resolve([])
  ]);

  return { campaignRows, leadRows, crmRows };
}

export async function writeBrief({ brandContext, brandMemory, source, inputData, connectedMeta = {}, date = new Date() }) {
  const analysis = analyzeInputs(inputData, brandMemory);
  const draftActions = buildRecommendedActions(analysis, brandContext, connectedMeta);
  const markdown = renderBrief({ brandContext, brandMemory, source, analysis, draftActions, connectedMeta, date });
  const briefPath = path.join(brandContext.paths.briefs, `${fileStamp(date)}-${source}-brief.md`);

  await writeText(briefPath, markdown);

  let draftPath = null;
  if (draftActions.length > 0) {
    const draftMarkdown = buildDraftMarkdown({
      brandContext,
      title: `${source} recommended safe actions`,
      summary: "Safe action candidates generated from the latest brief. Review before applying.",
      actions: draftActions,
      date
    });
    draftPath = path.join(brandContext.paths.drafts, `${fileStamp(date)}-${source}-safe-actions.md`);
    await writeText(draftPath, draftMarkdown);
  }

  await appendLearning(
    brandContext,
    `Generated ${source} brief. Spend: ${formatMoney(analysis.campaigns.totals.spend)}. Leads: ${analysis.campaigns.totals.leads}. Qualified lead signal: ${analysis.leads.qualified}/${analysis.leads.total}.`
  );

  return { briefPath, draftPath, analysis, markdown };
}

export function analyzeInputs(inputData, brandMemory = {}) {
  const campaignRows = inputData.campaignRows || [];
  const leadRows = [...(inputData.leadRows || []), ...(inputData.crmRows || [])];
  const campaigns = summarizeCampaignRows(campaignRows);
  const leads = summarizeLeadRows(leadRows);
  const targetCpl = brandMemory.stack?.targetCpl ?? null;
  const targetCostPerQualifiedLead = brandMemory.stack?.targetCostPerQualifiedLead ?? null;

  return {
    campaigns,
    leads,
    targetCpl,
    targetCostPerQualifiedLead,
    warnings: buildWarnings(campaigns, leads, { targetCpl, targetCostPerQualifiedLead })
  };
}

function renderBrief({ brandContext, brandMemory, source, analysis, draftActions, connectedMeta, date }) {
  const totals = analysis.campaigns.totals;
  const topWarnings = analysis.warnings.length ? analysis.warnings.map((warning) => `- ${warning}`).join("\n") : "- No major warnings from the available data.";
  const safeActions = draftActions.length
    ? draftActions.map((action) => `- ${humanAction(action)}`).join("\n")
    : "- No apply-ready safe actions from this run. In export mode this can mean the spend is historical or paused, the file lacks live current values, or no account was supplied. Keep recommendations manual until a connected/current account read confirms what is safe to change.";
  const trustGap = trustGapLines(analysis, brandMemory);
  const trustGapSection = trustGap.length
    ? `\n## Trust Gap\n\n${trustGap.map((line) => `- ${line}`).join("\n")}\n`
    : "";
  const brandMemoryBlock = renderBrandMemoryBlock(brandMemory);

  return `# LinkedIn Ads Brief

${UNTRUSTED_BANNER}

Brand: ${brandContext.brand}
Source: ${source}
Generated: ${date.toISOString()}

## Executive Summary

- Spend reviewed: ${formatMoney(totals.spend)}
- Impressions: ${totals.impressions.toLocaleString("en-US")}
- Clicks: ${totals.clicks.toLocaleString("en-US")}
- Leads: ${totals.leads.toLocaleString("en-US")}
- CTR: ${formatPercent(totals.ctr)}
- CPL: ${totals.cpl === null ? "n/a" : formatMoney(totals.cpl)}
- Qualified lead signal: ${analysis.leads.qualified}/${analysis.leads.total}

${topWarnings}
${trustGapSection}
## Buyer-Quality Diagnosis

The default question is not "did we get cheap leads?" The question is "did paid LinkedIn create evidence that the right buyers are moving closer to a real sales conversation?"

${buyerQualityDiagnosis(analysis)}

## Campaign And Account Structure

${campaignStructureDiagnosis(analysis)}

## Creative And Offer Angle

${creativeOfferDiagnosis(analysis, brandMemory)}

## Lead Form And Sales Handoff

${leadFormDiagnosis(analysis)}

## Thought Leader Ads Opportunities

Use Thought Leader Ads when the post carries human trust that the company page cannot fake. Prioritize posts with buyer pain, proof, a sharp point of view, and comments from people who resemble the ICP.

Recommended next move:

- Collect 5-10 posts from the listed thought leaders in \`voice-profile.md\`.
- Score them with \`npm run draft -- --action thought-leader-ad --post "<url>" --post-text "<text>"\`.
- Launch manually if approval/API access blocks creation.

## Approved-Safe Next Actions

${safeActions}

## Manual-Only Recommendations

- Review audience expansion and non-ICP targeting before increasing spend.
- Compare lead form submissions against CRM outcomes, not just LinkedIn CPL.
- Add one qualifying question if sales reports bad-fit leads.
- Build a sales handoff note for every high-intent form or Thought Leader Ad campaign.

## Connected Metadata

- API version: ${connectedMeta.apiVersion || "n/a"}
- Ad account: ${connectedMeta.accountUrn || connectedMeta.accountId || "n/a"}

## Brand Memory (Untrusted)

${brandMemoryBlock}
`;
}

function buildWarnings(campaigns, leads, targets) {
  const warnings = [];
  const totals = campaigns.totals;

  if (totals.spend > 0 && totals.leads === 0) {
    warnings.push("Spend exists without lead volume. Confirm the offer, tracking, and form path before scaling.");
  }

  if (totals.cpl && targets.targetCpl && totals.cpl > targets.targetCpl) {
    warnings.push(`CPL is above the brand target (${formatMoney(totals.cpl)} vs ${formatMoney(targets.targetCpl)}). Do not optimize on CPL alone; check buyer quality.`);
  }

  if (leads.total > 0 && leads.qualifiedRate < 0.2) {
    warnings.push("Qualified lead signal is weak. Sales feedback should drive the next optimization pass.");
  }

  const highSpendNoLead = campaigns.campaigns.filter((campaign) => campaign.spend >= HIGH_SPEND_NO_LEAD_THRESHOLD_USD && campaign.leads === 0);
  if (highSpendNoLead.length) {
    warnings.push(`${highSpendNoLead.length} campaign(s) spent at least $200 without lead signal.`);
  }

  return warnings;
}

function buyerQualityDiagnosis(analysis) {
  if (analysis.leads.total === 0) {
    return "No lead or CRM file was provided. Treat this as a media-only read, then add CRM outcomes before making serious budget calls.";
  }

  if (analysis.leads.qualifiedRate >= 0.35) {
    return "There is some buyer-quality signal. The next pass should identify which campaigns, forms, and offers produced those qualified leads.";
  }

  return "Lead volume is not translating into enough qualified signal. Tighten the ICP, add friction where it filters bad fits, and inspect the offer promise before increasing budget.";
}

function campaignStructureDiagnosis(analysis) {
  const campaigns = analysis.campaigns.campaigns;
  if (!campaigns.length) return "No campaign rows were available.";

  const noLeadSpend = campaigns.filter((campaign) => campaign.spend >= HIGH_SPEND_NO_LEAD_THRESHOLD_USD && campaign.leads === 0);
  const lowCtr = campaigns.filter((campaign) => campaign.impressions >= 1000 && campaign.ctr < 0.0035);

  return [
    noLeadSpend.length ? `${noLeadSpend.length} campaign(s) show spend without lead signal. These are pause or budget-reduction candidates if tracking is healthy.` : "No obvious high-spend zero-lead campaigns from the available rows.",
    lowCtr.length ? `${lowCtr.length} campaign(s) have weak CTR. That usually points to offer, hook, or audience mismatch.` : "CTR does not show an obvious account-wide creative mismatch from the available rows."
  ].join("\n\n");
}

function creativeOfferDiagnosis(analysis, brandMemory) {
  const offer = brandMemory.offer?.trim() ? "The brand offer file is available and should be used to judge whether ads are selling a real next step." : "The offer file is still thin. Fill it in before treating creative recommendations as final.";
  const ctr = analysis.campaigns.totals.ctr;

  if (ctr && ctr < 0.0035) {
    return `${offer}\n\nAccount CTR is weak. Rewrite angles around buyer pain, proof, and the cost of inaction rather than generic product claims.`;
  }

  return `${offer}\n\nCreative is not the first obvious bottleneck from the aggregate data. Keep pressure on buyer quality and sales handoff.`;
}

function leadFormDiagnosis(analysis) {
  if (analysis.leads.total === 0) {
    return "No lead-form or CRM data was available. Export lead form responses or CRM outcomes to evaluate form friction and sales handoff.";
  }

  const paragraphs = [];

  if (analysis.leads.disqualified > analysis.leads.qualified) {
    paragraphs.push("Disqualified signal is higher than qualified signal. Add qualification friction, make the offer more specific, and hand sales the campaign/ad context.");
  } else {
    paragraphs.push("Lead data is available. Map form fields to CRM stages so the next brief can separate cheap leads from real buyers.");
  }

  paragraphs.push(leadFieldCoverageDiagnosis(analysis.leads));
  paragraphs.push(customLeadFieldDiagnosis(analysis.leads));
  paragraphs.push(leadSourceDiagnosis(analysis.leads));

  return paragraphs.filter(Boolean).join("\n\n");
}

function leadFieldCoverageDiagnosis(leads) {
  const detected = leads.fieldCoverage
    .filter((field) => field.count > 0)
    .map((field) => `${field.label} (${field.count}/${leads.total})`);

  if (!detected.length) {
    return "No recognizable lead-form columns were detected. Keep the rows, but add a simple field mapping before making sales handoff calls.";
  }

  const importantMissing = leads.fieldCoverage
    .filter((field) => ["email", "workEmail", "companyName", "jobTitle", "campaign", "adId", "adSetId"].includes(field.field))
    .filter((field) => field.count === 0)
    .map((field) => field.label);

  const missing = importantMissing.length ? ` Missing useful handoff fields: ${importantMissing.join(", ")}.` : "";
  const testLeadNote = leads.testLeadKnown ? ` Test leads flagged: ${leads.testLeads}/${leads.testLeadKnown}.` : "";
  return `Mapped lead fields detected: ${detected.slice(0, 10).join(", ")}.${missing}${testLeadNote}`;
}

function customLeadFieldDiagnosis(leads) {
  if (!leads.customFields.length) {
    return "No custom question or hidden-field columns were detected.";
  }

  const fields = leads.customFields
    .slice(0, 8)
    .map((field) => `${field.label} (${field.count}/${leads.total})`)
    .join(", ");

  return `Custom questions / hidden fields preserved: ${fields}. Treat these as qualification, routing, and attribution signals rather than discarding them during CRM import.`;
}

function leadSourceDiagnosis(leads) {
  if (!leads.campaigns.length) {
    return "No campaign, ad, or ad set metadata was detected in the lead rows. Add hidden fields or export from the ad context so sales can see which promise started the conversation.";
  }

  return `Lead source concentration: ${leads.campaigns.map((campaign) => `${sanitizeCellForMarkdown(campaign.value)} (${campaign.count})`).join(", ")}. Use this to compare lead quality by campaign or offer, not just total lead count.`;
}

function buildRecommendedActions(analysis, brandContext, connectedMeta = {}) {
  const accountUrn = normalizeSponsoredAccountUrn(connectedMeta.accountUrn || connectedMeta.accountId || "");
  if (!accountUrn) return [];

  const actions = [];
  const seenTargets = new Set();

  for (const campaign of analysis.campaigns.campaigns) {
    if (!campaign.targetUrn || !String(campaign.targetUrn).startsWith("urn:li:")) continue;
    if (seenTargets.has(campaign.targetUrn)) continue;

    if (campaign.spend >= HIGH_SPEND_NO_LEAD_THRESHOLD_USD && campaign.leads === 0 && /active/i.test(campaign.status)) {
      seenTargets.add(campaign.targetUrn);
      actions.push({
        type: "pause_campaign",
        brand: brandContext.brand,
        adAccountUrn: accountUrn,
        targetUrn: campaign.targetUrn,
        currentField: "status",
        currentValue: campaign.status,
        proposedValue: "PAUSED",
        reason: `${campaign.name} has ${formatMoney(campaign.spend)} spend and no lead signal in the available data.`,
        riskLevel: "medium",
        rollbackNote: "Set campaign intendedStatus/status back to ACTIVE after reviewing tracking and buyer-quality evidence."
      });
      continue;
    }

    if (campaign.dailyBudget && campaign.cpl && analysis.campaigns.totals.cpl && campaign.cpl > analysis.campaigns.totals.cpl * 1.5) {
      seenTargets.add(campaign.targetUrn);
      actions.push({
        type: "set_daily_budget",
        brand: brandContext.brand,
        adAccountUrn: accountUrn,
        targetUrn: campaign.targetUrn,
        currentField: "dailyBudget",
        currentValue: campaign.dailyBudget,
        proposedValue: {
          amount: String(Math.max(1, Math.round(campaign.dailyBudget * 0.7))),
          currencyCode: campaign.currencyCode || "USD"
        },
        reason: `${campaign.name} CPL is materially above account average.`,
        riskLevel: "low",
        rollbackNote: `Restore daily budget to ${campaign.dailyBudget}.`
      });
    }
  }

  return actions.slice(0, 10);
}

function humanAction(action) {
  const reason = sanitizeCellForMarkdown(action.reason);
  if (action.type === "pause_campaign") return `Pause campaign ${action.targetUrn}: ${reason}`;
  if (action.type === "set_daily_budget") return `Set campaign budget ${action.targetUrn} from ${action.currentValue} to ${action.proposedValue}: ${reason}`;
  if (action.type === "pause_creative") return `Pause creative ${action.targetUrn}: ${reason}`;
  return `${action.type} ${action.targetUrn}: ${reason}`;
}

export function trustGapLines(analysis) {
  const candidates = analysis.campaigns.trustGapCandidates || [];
  if (!candidates.length) return [];

  return candidates.slice(0, 5).map((campaign) => {
    const ctr = formatPercent(campaign.ctr);
    const spend = formatMoney(campaign.spend);
    const campaignName = sanitizeCellForMarkdown(campaign.name);
    const variantHint = campaign.variant ? ` (${sanitizeCellForMarkdown(campaign.variant)})` : "";
    return `${campaignName}${variantHint} spent ${spend} with CTR ${ctr} and only ${campaign.leads} lead(s). Company-page creative without enough credibility. Test a Thought Leader Ad, add proof, or rewrite around a sharper buyer pain before scaling.`;
  });
}

function renderBrandMemoryBlock(brandMemory) {
  const sections = fencedBrandMemorySections(brandMemory);
  return sections.map((section) => section.fenced).join("\n\n");
}
