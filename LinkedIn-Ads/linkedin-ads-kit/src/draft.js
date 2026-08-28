import path from "node:path";
import { fileStamp } from "./dates.js";
import { writeText } from "./files.js";
import { loadSelectedAccount } from "./workspace.js";
import { buildThoughtLeaderFallbackPacket, scoreThoughtLeaderPost } from "./thoughtLeaderAds.js";

export const DRAFT_BLOCK_LANGUAGE = "linkedin-ads-draft";

export function buildDraftMarkdown({ brandContext, title, summary, actions, fallbackPacket = "", date = new Date() }) {
  const payload = {
    version: 1,
    generatedAt: date.toISOString(),
    brand: brandContext.brand,
    brandMode: brandContext.mode,
    actions
  };

  return `# ${title}

Brand: ${brandContext.brand}
Generated: ${date.toISOString()}

## Summary

${summary}

## Actions

${actions.length ? actions.map((action, index) => renderAction(index + 1, action)).join("\n\n") : "No applyable actions."}

${fallbackPacket ? `${fallbackPacket}\n` : ""}## Machine Draft

\`\`\`${DRAFT_BLOCK_LANGUAGE}
${JSON.stringify(payload, null, 2)}
\`\`\`
`;
}

export async function writeDraft({ brandContext, brandMemory, args, date = new Date() }) {
  const action = args.action;
  if (!action) {
    throw new Error("Missing --action. Try pause-campaign, pause-creative, set-daily-budget, activate-creative, or thought-leader-ad.");
  }

  const selectedAccount = await loadSelectedAccount(brandContext);
  const enrichedArgs = { ...args };
  if (!enrichedArgs.ad_account_urn && !enrichedArgs.account_urn && selectedAccount?.urn) {
    enrichedArgs.ad_account_urn = selectedAccount.urn;
  }

  const { actions, title, summary, fallbackPacket } = buildDraft({ brandContext, brandMemory, args: enrichedArgs, date });
  const markdown = buildDraftMarkdown({ brandContext, title, summary, actions, fallbackPacket, date });
  const draftPath = path.join(brandContext.paths.drafts, `${fileStamp(date)}-${normalizeActionName(action)}.md`);
  await writeText(draftPath, markdown);
  return { draftPath, markdown, actions };
}

export function buildDraft({ brandContext, brandMemory = {}, args = {}, date = new Date() }) {
  const action = normalizeActionName(args.action);
  const accountUrn = args.ad_account_urn || args.account_urn || brandMemory.stack?.linkedinAdAccountUrn || "";
  const targetUrn = args.target || args.target_urn || "";
  const reason = args.reason || "Operator-created draft action.";
  const current = args.current ?? args.current_value ?? "";

  if (action === "pause-campaign") {
    requireTarget(targetUrn, action);
    return {
      title: "Pause Campaign Draft",
      summary: "Pause one campaign after review.",
      actions: [baseAction({
        brandContext,
        type: "pause_campaign",
        accountUrn,
        targetUrn,
        currentField: "status",
        currentValue: current,
        proposedValue: "PAUSED",
        reason,
        riskLevel: "medium",
        rollbackNote: "Restore the campaign to ACTIVE if tracking or buyer-quality review clears it."
      })]
    };
  }

  if (action === "pause-creative") {
    requireTarget(targetUrn, action);
    return {
      title: "Pause Creative Draft",
      summary: "Pause one creative after review.",
      actions: [baseAction({
        brandContext,
        type: "pause_creative",
        accountUrn,
        targetUrn,
        currentField: "intendedStatus",
        currentValue: current,
        proposedValue: "PAUSED",
        reason,
        riskLevel: "low",
        rollbackNote: "Restore the creative intendedStatus to ACTIVE if needed."
      })]
    };
  }

  if (action === "set-daily-budget") {
    requireTarget(targetUrn, action);
    const proposed = Number(args.proposed ?? args.proposed_value ?? args.budget);
    if (!Number.isFinite(proposed) || proposed <= 0) {
      throw new Error("set-daily-budget requires --proposed or --budget with a positive number.");
    }

    return {
      title: "Set Daily Budget Draft",
      summary: "Update one campaign daily budget after review.",
      actions: [baseAction({
        brandContext,
        type: "set_daily_budget",
        accountUrn,
        targetUrn,
        currentField: "dailyBudget",
        currentValue: Number(current),
        proposedValue: {
          amount: String(proposed),
          currencyCode: args.currency || args.currency_code || brandMemory.stack?.currencyCode || "USD"
        },
        reason,
        riskLevel: "low",
        rollbackNote: `Restore daily budget to ${current}.`
      })]
    };
  }

  if (action === "activate-creative") {
    requireTarget(targetUrn, action);
    return {
      title: "Activate Creative Draft",
      summary: "Activate one already-approved draft creative after review.",
      actions: [baseAction({
        brandContext,
        type: "activate_creative",
        accountUrn,
        targetUrn,
        currentField: "intendedStatus",
        currentValue: current,
        proposedValue: "ACTIVE",
        reason,
        riskLevel: "medium",
        rollbackNote: "Set intendedStatus back to DRAFT or PAUSED."
      })]
    };
  }

  if (action === "thought-leader-ad") {
    const postUrl = args.post || args.post_url || targetUrn;
    const postText = args.post_text || args.text || "";
    const postUrn = args.post_urn || "";
    const campaignUrn = args.campaign || args.campaign_urn || "";
    const score = scoreThoughtLeaderPost({
      url: postUrl,
      text: postText,
      reactions: args.reactions,
      comments: args.comments,
      shares: args.shares
    }, brandMemory);
    const fallbackPacket = buildThoughtLeaderFallbackPacket({
      post: { url: postUrl, text: postText },
      score,
      brandMemory,
      campaign: { budget: args.budget }
    });

    const actions = [];
    const hasApiInputs = Boolean(postUrn && campaignUrn);
    const apiEligible = hasApiInputs && score.recommendation !== "manual_review";
    if (apiEligible) {
      actions.push(baseAction({
        brandContext,
        type: "create_thought_leader_creative",
        adAccountUrn: accountUrn,
        targetUrn: campaignUrn,
        currentField: "creative",
        currentValue: "none",
        proposedValue: {
          postUrn,
          campaignUrn,
          intendedStatus: args.intended_status || "DRAFT"
        },
        reason: `Thought Leader Ad candidate scored ${score.total}/100.`,
        riskLevel: "medium",
        rollbackNote: "Pause or cancel the created draft creative if approval or launch quality is not acceptable."
      }));
    }

    return {
      title: "Thought Leader Ad Draft",
      summary: thoughtLeaderSummary({ score, hasApiInputs, apiEligible }),
      actions,
      fallbackPacket
    };
  }

  throw new Error(`Unsupported draft action: ${args.action}`);
}

function thoughtLeaderSummary({ score, hasApiInputs, apiEligible }) {
  const base = `Thought Leader Ad candidate scored ${score.total}/100 (${score.recommendation}).`;
  if (apiEligible) return `${base} API creative draft is included because the post cleared the score gate and API inputs were provided.`;
  if (hasApiInputs) return `${base} No API creative action was created because this post needs manual review before paid amplification.`;
  return `${base} API creation is included only for test_candidate or strong_candidate posts when --post-urn and --campaign are provided.`;
}

export function parseDraftMarkdown(markdown) {
  const block = new RegExp(`\`\`\`${DRAFT_BLOCK_LANGUAGE}\\n([\\s\\S]*?)\\n\`\`\``).exec(markdown);
  if (!block) {
    throw new Error(`Draft is missing a \`\`\`${DRAFT_BLOCK_LANGUAGE}\` machine block.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(block[1]);
  } catch (error) {
    const blockStart = markdown.slice(0, block.index).split("\n").length;
    const blockEnd = blockStart + block[1].split("\n").length + 1;
    throw new Error(`Draft machine block at lines ${blockStart}-${blockEnd} is not valid JSON: ${error.message}`);
  }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.actions)) {
    throw new Error("Draft machine block is not a valid LinkedIn Ads Kit draft.");
  }

  return parsed;
}

export function normalizeActionName(action) {
  return String(action || "").trim().toLowerCase().replaceAll("_", "-");
}

function renderAction(index, action) {
  return `### ${index}. ${action.type}

- Target: ${action.targetUrn}
- Current: ${String(action.currentValue)}
- Proposed: ${JSON.stringify(action.proposedValue)}
- Risk: ${action.riskLevel}
- Why this matters: ${action.reason}
- Rollback: ${action.rollbackNote}`;
}

function requireTarget(targetUrn, action) {
  if (!targetUrn) {
    throw new Error(`${action} requires --target <urn>.`);
  }
}

function baseAction(action) {
  return {
    brand: action.brandContext?.brand,
    adAccountUrn: action.accountUrn || action.adAccountUrn || "",
    targetUrn: action.targetUrn,
    type: action.type,
    currentField: action.currentField,
    currentValue: action.currentValue,
    proposedValue: action.proposedValue,
    reason: action.reason,
    riskLevel: action.riskLevel,
    rollbackNote: action.rollbackNote
  };
}
