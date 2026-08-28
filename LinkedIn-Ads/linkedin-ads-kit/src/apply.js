import { readFile } from "node:fs/promises";
import { createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { fileStamp } from "./dates.js";
import { parseDraftMarkdown } from "./draft.js";
import { appendText, readJsonIfExists, sha256File, writeJson, writeText } from "./files.js";
import { appendLearning, loadSelectedAccount } from "./workspace.js";
import { normalizeSponsoredAccountUrn } from "./urns.js";

const DRY_RUN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DRY_RUN_KEY_DIR_MODE = 0o700;
const DRY_RUN_KEY_FILE_MODE = 0o600;

export const DRY_RUN_REQUIRED_MESSAGE = "No recent dry-run found. Run `npm run apply -- --draft <path> --dry-run` first.";
export const DRY_RUN_HASH_MISMATCH_MESSAGE = "Draft has changed since the last dry-run. Run --dry-run again.";
export const DRY_RUN_STALE_MESSAGE = "Last dry-run is stale (>24h). Run --dry-run again.";
export const DRY_RUN_RECEIPT_INVALID_MESSAGE = "Dry-run receipt is invalid. Run --dry-run again.";

function dryRunSidecarPath(draftPath) {
  return `${draftPath}.dry-run.json`;
}

const ALLOWED_ACTIONS = new Set([
  "pause_campaign",
  "pause_creative",
  "set_daily_budget",
  "activate_creative",
  "create_thought_leader_creative"
]);

const DESTRUCTIVE_PATTERN = /delete|remove|destroy|create_campaign|broad_campaign/i;

export async function applyDraft({
  brandContext,
  draftPath,
  client,
  confirm,
  dryRun = false,
  skipDryRunCheck = false,
  stderr = process.stderr,
  date = new Date()
}) {
  if (!draftPath) throw new Error("Missing --draft <path>.");
  validateDraftPathForBrand(draftPath, brandContext);
  const markdown = await readFile(draftPath, "utf8");
  const draft = parseDraftMarkdown(markdown);
  await validateDraftForBrand(draft, brandContext);
  validateActions(draft.actions);

  const preflight = [];
  for (const action of draft.actions) {
    preflight.push(await preflightAction(action, client));
  }

  if (dryRun) {
    const sidecarPath = dryRunSidecarPath(draftPath);
    const draftHash = await sha256File(draftPath);
    const observedValues = Object.fromEntries(preflight.map((item) => [item.targetUrn, {
      currentField: item.currentField,
      expected: item.expected,
      observed: item.observed
    }]));
    const receipt = await buildDryRunReceipt({ brandContext, draftPath, draftHash, timestamp: date.toISOString(), observedValues });
    await writeJson(sidecarPath, {
      draftHash,
      timestamp: receipt.timestamp,
      observedValues,
      brand: receipt.brand,
      brandMode: receipt.brandMode,
      draftPath: receipt.draftPath,
      version: receipt.version,
      signature: receipt.signature
    });

    return {
      dryRun: true,
      draft,
      preflight,
      auditPath: null,
      results: [],
      sidecarPath
    };
  }

  if (confirm !== "APPLY") {
    throw new Error("Live apply requires --confirm APPLY. Run with --dry-run first.");
  }

  if (skipDryRunCheck) {
    stderr.write("WARNING: --skip-dry-run-check bypassed the dry-run sidecar gate. Proceed only for scripted/CI use.\n");
  } else {
    await enforceDryRunSidecar(draftPath, brandContext, date);
  }

  const results = [];
  let failure = null;
  for (let index = 0; index < draft.actions.length; index += 1) {
    const action = draft.actions[index];
    try {
      const result = await applyAction(action, client);
      results.push({ ok: true, type: action.type, targetUrn: action.targetUrn, result });
    } catch (error) {
      failure = error;
      results.push({ ok: false, type: action.type, targetUrn: action.targetUrn, error: error.message });

      for (const skipped of draft.actions.slice(index + 1)) {
        results.push({ ok: false, type: skipped.type, targetUrn: skipped.targetUrn, skipped: true, error: "Skipped after earlier apply failure." });
      }
      break;
    }
  }

  const auditPath = path.join(brandContext.paths.auditTrail, `${fileStamp(date)}-apply.md`);
  await writeText(auditPath, renderAudit({ draftPath, draft, preflight, results, date }));
  await appendLearning(brandContext, `${failure ? "Attempted" : "Applied"} draft ${path.basename(draftPath)} with ${results.filter((result) => result.ok).length}/${draft.actions.length} successful action(s). Audit: ${path.relative(brandContext.cwd, auditPath)}.`);

  if (failure) {
    const error = new Error(`Apply failed after ${results.filter((result) => result.ok).length}/${draft.actions.length} successful action(s). Audit written: ${path.relative(brandContext.cwd, auditPath)}. ${failure.message}`);
    error.auditPath = auditPath;
    error.results = results;
    throw error;
  }

  return { dryRun: false, draft, preflight, auditPath, results };
}

export async function enforceDryRunSidecar(draftPath, brandContext, now = new Date()) {
  const sidecarPath = dryRunSidecarPath(draftPath);
  const sidecar = await readJsonIfExists(sidecarPath, null);
  if (!sidecar) {
    throw new Error(DRY_RUN_REQUIRED_MESSAGE);
  }

  const currentHash = await sha256File(draftPath);
  if (sidecar.draftHash !== currentHash) {
    throw new Error(DRY_RUN_HASH_MISMATCH_MESSAGE);
  }

  const expectedDraftPath = relativeDraftPath(brandContext, draftPath);
  if (sidecar.version !== 1 || sidecar.brand !== brandContext.brand || sidecar.draftPath !== expectedDraftPath) {
    throw new Error(DRY_RUN_RECEIPT_INVALID_MESSAGE);
  }

  const validSignature = await verifyDryRunReceipt({ brandContext, sidecar });
  if (!validSignature) {
    throw new Error(DRY_RUN_RECEIPT_INVALID_MESSAGE);
  }

  const sidecarTimestamp = sidecar.timestamp ? Date.parse(sidecar.timestamp) : NaN;
  if (!Number.isFinite(sidecarTimestamp)) {
    throw new Error(DRY_RUN_STALE_MESSAGE);
  }

  const ageMs = now.getTime() - sidecarTimestamp;
  if (ageMs > DRY_RUN_MAX_AGE_MS) {
    throw new Error(DRY_RUN_STALE_MESSAGE);
  }

  return { sidecarPath, sidecar };
}

export function validateDraftPathForBrand(draftPath, brandContext) {
  const resolvedDraft = path.resolve(draftPath);
  const draftsRoot = path.resolve(brandContext.paths.drafts);
  const relative = path.relative(draftsRoot, resolvedDraft);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    throw new Error(`Draft must live under ${path.relative(brandContext.cwd, draftsRoot)} for brand "${brandContext.brand}".`);
  }
}

export async function validateDraftForBrand(draft, brandContext) {
  if (draft.brand !== brandContext.brand) {
    throw new Error(`Draft brand mismatch. Draft is for "${draft.brand}", current command resolved "${brandContext.brand}".`);
  }

  const allowedAccountUrns = await brandAccountUrns(brandContext);
  if (!allowedAccountUrns.size) {
    throw new Error("No selected LinkedIn ad account is configured for this brand. Run connected:brief or select an account before applying.");
  }

  for (const action of draft.actions || []) {
    if (!allowedAccountUrns.has(normalizeSponsoredAccountUrn(action.adAccountUrn))) {
      throw new Error(`Draft account mismatch for ${action.targetUrn}. Action targets ${action.adAccountUrn}, but ${brandContext.brand} is configured for ${Array.from(allowedAccountUrns).join(", ")}.`);
    }
  }
}

export function validateActions(actions) {
  if (!actions.length) {
    throw new Error("Draft has no applyable actions.");
  }

  for (const action of actions) {
    if (!ALLOWED_ACTIONS.has(action.type) || DESTRUCTIVE_PATTERN.test(action.type)) {
      throw new Error(`Refusing unsupported or destructive action: ${action.type}`);
    }
    for (const field of ["brand", "adAccountUrn", "targetUrn", "currentField", "currentValue", "proposedValue", "reason", "riskLevel", "rollbackNote"]) {
      if (action[field] === undefined || action[field] === "") {
        throw new Error(`Action ${action.type} is missing required field: ${field}`);
      }
    }
    if (String(action.currentValue).toUpperCase() === "UNKNOWN") {
      throw new Error(`Action ${action.type} has UNKNOWN currentValue. Refresh the account data or pass --current.`);
    }
  }
}

async function preflightAction(action, client) {
  const current = await fetchCurrent(action, client);
  const observed = readField(current, action.currentField);

  if (observed !== undefined && String(observed) !== String(action.currentValue)) {
    throw new Error(`Stale draft for ${action.targetUrn}. Expected ${action.currentField}=${action.currentValue}, observed ${observed}.`);
  }

  return {
    targetUrn: action.targetUrn,
    type: action.type,
    currentField: action.currentField,
    expected: action.currentValue,
    observed: observed ?? "not_available"
  };
}

async function applyAction(action, client) {
  if (action.type === "pause_campaign") {
    return client.patchCampaign(action.adAccountUrn, action.targetUrn, { status: "PAUSED", intendedStatus: "PAUSED" });
  }

  if (action.type === "pause_creative") {
    return client.patchCreative(action.adAccountUrn, action.targetUrn, { intendedStatus: "PAUSED" });
  }

  if (action.type === "set_daily_budget") {
    return client.patchCampaign(action.adAccountUrn, action.targetUrn, {
      dailyBudget: normalizeDailyBudget(action.proposedValue, action.currentValue, action.currencyCode)
    });
  }

  if (action.type === "activate_creative") {
    return client.patchCreative(action.adAccountUrn, action.targetUrn, { intendedStatus: "ACTIVE" });
  }

  if (action.type === "create_thought_leader_creative") {
    return client.createCreativeFromExistingPost({
      adAccountUrn: action.adAccountUrn,
      campaignUrn: action.proposedValue.campaignUrn,
      postUrn: action.proposedValue.postUrn,
      intendedStatus: action.proposedValue.intendedStatus || "DRAFT"
    });
  }

  throw new Error(`Unsupported action: ${action.type}`);
}

async function fetchCurrent(action, client) {
  if (action.type.includes("creative")) {
    if (action.type === "create_thought_leader_creative") {
      return { creative: "none" };
    }
    return client.getCreative(action.adAccountUrn, action.targetUrn);
  }

  return client.getCampaign(action.adAccountUrn, action.targetUrn);
}

function readField(value, field) {
  if (!value || !field) return undefined;
  if (field === "status") return value.status ?? value.intendedStatus;
  if (field === "dailyBudget") return value.dailyBudget?.amount ?? value.dailyBudget;
  if (value[field] !== undefined) return value[field];
  return undefined;
}

async function brandAccountUrns(brandContext) {
  const selected = await loadSelectedAccount(brandContext);
  const candidates = [
    selected?.urn,
    selected?.accountUrn,
    selected?.id,
    selected?.accountId
  ].filter(Boolean);

  return new Set(candidates.map(normalizeSponsoredAccountUrn));
}

async function buildDryRunReceipt({ brandContext, draftPath, draftHash, timestamp, observedValues }) {
  const payload = dryRunReceiptPayload({ brandContext, draftPath, draftHash, timestamp, observedValues });
  const signature = await signDryRunReceipt(brandContext, payload, { create: true });
  return { ...payload, signature };
}

async function verifyDryRunReceipt({ brandContext, sidecar }) {
  const payload = dryRunReceiptPayload({
    brandContext,
    draftPath: path.join(brandContext.cwd, sidecar.draftPath || ""),
    draftHash: sidecar.draftHash,
    timestamp: sidecar.timestamp,
    observedValues: sidecar.observedValues || {}
  });
  if (payload.brand !== sidecar.brand || payload.brandMode !== sidecar.brandMode || payload.draftPath !== sidecar.draftPath || payload.version !== sidecar.version) {
    return false;
  }
  const expected = await signDryRunReceipt(brandContext, payload, { create: false });
  return Boolean(expected && sidecar.signature === expected);
}

function dryRunReceiptPayload({ brandContext, draftPath, draftHash, timestamp, observedValues }) {
  return {
    version: 1,
    brand: brandContext.brand,
    brandMode: brandContext.mode,
    draftPath: relativeDraftPath(brandContext, draftPath),
    draftHash,
    timestamp,
    observedValues
  };
}

function relativeDraftPath(brandContext, draftPath) {
  return path.relative(brandContext.cwd, path.resolve(draftPath));
}

async function signDryRunReceipt(brandContext, payload, options = {}) {
  const key = await loadDryRunSigningKey(brandContext, options);
  if (!key) return "";
  return createHmac("sha256", key).update(JSON.stringify(payload)).digest("hex");
}

async function loadDryRunSigningKey(brandContext, options = {}) {
  const existing = await readJsonIfExists(brandContext.paths.dryRunKey, null);
  if (existing?.key) return existing.key;
  if (!options.create) return "";

  const key = randomBytes(32).toString("hex");
  await writeJson(brandContext.paths.dryRunKey, { key }, {
    dirMode: DRY_RUN_KEY_DIR_MODE,
    fileMode: DRY_RUN_KEY_FILE_MODE
  });
  return key;
}

function normalizeDailyBudget(proposedValue, currentValue, fallbackCurrencyCode = "USD") {
  if (proposedValue && typeof proposedValue === "object") {
    return {
      amount: String(proposedValue.amount),
      currencyCode: proposedValue.currencyCode || currencyCodeFrom(currentValue) || fallbackCurrencyCode
    };
  }

  return {
    amount: String(proposedValue),
    currencyCode: currencyCodeFrom(currentValue) || fallbackCurrencyCode
  };
}

function currencyCodeFrom(value) {
  if (value && typeof value === "object") return value.currencyCode;
  return null;
}

function renderAudit({ draftPath, draft, preflight, results, date }) {
  return `# Apply Audit

Generated: ${date.toISOString()}
Draft: ${draftPath}
Brand: ${draft.brand}

## Preflight

${preflight.map((item) => `- ${item.type} ${item.targetUrn}: expected ${item.currentField}=${item.expected}, observed ${item.observed}`).join("\n")}

## Results

${results.map((result, index) => `### ${index + 1}

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\``).join("\n\n")}
`;
}

export async function appendApplyNote(brandContext, content) {
  await appendText(brandContext.paths.learnings, content);
}
