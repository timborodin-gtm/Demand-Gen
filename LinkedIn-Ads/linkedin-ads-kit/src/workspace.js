import path from "node:path";
import { readdir } from "node:fs/promises";
import { appendText, ensureDir, pathExists, readJsonIfExists, readTextIfExists, writeIfMissing, writeJson, writeText } from "./files.js";
import { dayStamp } from "./dates.js";
import { fenceUntrusted } from "./untrusted.js";

export { fenceUntrusted } from "./untrusted.js";

const CACHE_DIR_MODE = 0o700;

const BRAND_FILES = {
  "profile.md": `# Brand Profile

## Company

Name:

## Category

What market do you compete in?

## Positioning

What do you want buyers to believe after seeing your ads?

## Proof

What evidence can we use in ads?
`,
  "audience.md": `# Audience

## Ideal Customer Profile

Who should LinkedIn Ads reach?

## Buying Committee

List roles, seniority, departments, company sizes, and industries.

## Disqualifiers

Who should not become a lead?

## Buyer Pain

What expensive problem are they trying to solve?
`,
  "voice-profile.md": `# Voice Profile

## Brand Voice

How should the brand sound?

## Thought Leaders

List people whose posts could become Thought Leader Ads.

## Phrases To Use

-

## Phrases To Avoid

-
`,
  "offer.md": `# Offer

## Primary Offer

What are we asking the buyer to do?

## Conversion Path

What happens after the click?

## Qualification Signals

What separates a real buyer from a low-quality lead?
`,
  "learnings.md": `# Learnings

Append durable performance and buyer-quality insights here.
`
};

const STACK_TEMPLATE = {
  linkedinAdAccountId: "",
  linkedinAdAccountUrn: "",
  targetCpl: null,
  targetCostPerQualifiedLead: null,
  targetPipelineStage: "sales-qualified opportunity",
  crm: "",
  notes: ""
};

export function sanitizeBrandSlug(value) {
  if (!value) return "";
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug || slug === "." || slug === "..") {
    throw new Error(`Invalid brand slug: ${value}`);
  }

  return slug;
}

export function resolveBrand(options = {}) {
  const cwd = options.cwd || process.cwd();
  const workspaceRoot = path.join(cwd, "workspace");
  const requestedBrand = options.brand ? sanitizeBrandSlug(options.brand) : "";
  const brandRoot = requestedBrand
    ? path.join(workspaceRoot, "brands", requestedBrand)
    : path.join(workspaceRoot, "brand");

  return {
    cwd,
    workspaceRoot,
    brandRoot,
    brand: requestedBrand || "default",
    mode: requestedBrand ? "named" : "default",
    linkedinRoot: path.join(brandRoot, "linkedin"),
    paths: {
      profile: path.join(brandRoot, "profile.md"),
      audience: path.join(brandRoot, "audience.md"),
      voice: path.join(brandRoot, "voice-profile.md"),
      offer: path.join(brandRoot, "offer.md"),
      stack: path.join(brandRoot, "stack.json"),
      learnings: path.join(brandRoot, "learnings.md"),
      account: path.join(brandRoot, "linkedin", "account.md"),
      briefs: path.join(brandRoot, "linkedin", "briefs"),
      drafts: path.join(brandRoot, "linkedin", "drafts"),
      auditTrail: path.join(brandRoot, "linkedin", "audit-trail"),
      cache: path.join(brandRoot, "linkedin", "cache"),
      selectedAccount: path.join(brandRoot, "linkedin", "cache", "selected-account.json"),
      token: path.join(brandRoot, "linkedin", "cache", "oauth-token.json"),
      dryRunKey: path.join(brandRoot, "linkedin", "cache", "dry-run-key.json")
    }
  };
}

export async function initBrandWorkspace(brandContext) {
  const created = [];
  const skipped = [];

  await ensureDir(brandContext.brandRoot);
  await ensureDir(brandContext.linkedinRoot);
  await ensureDir(brandContext.paths.briefs);
  await ensureDir(brandContext.paths.drafts);
  await ensureDir(brandContext.paths.auditTrail);
  await ensureDir(brandContext.paths.cache, { mode: CACHE_DIR_MODE });

  for (const [fileName, content] of Object.entries(BRAND_FILES)) {
    const filePath = path.join(brandContext.brandRoot, fileName);
    const didCreate = await writeIfMissing(filePath, content);
    (didCreate ? created : skipped).push(relativeFromCwd(brandContext.cwd, filePath));
  }

  const didCreateStack = await writeIfMissing(
    brandContext.paths.stack,
    `${JSON.stringify(STACK_TEMPLATE, null, 2)}\n`
  );
  (didCreateStack ? created : skipped).push(relativeFromCwd(brandContext.cwd, brandContext.paths.stack));

  const didCreateAccount = await writeIfMissing(
    brandContext.paths.account,
    `# LinkedIn Account

Brand: ${brandContext.brand}

## Selected Ad Account

Not selected yet.

Run:

\`\`\`bash
npm run auth
npm run connected:brief${brandContext.mode === "named" ? ` -- --brand ${brandContext.brand}` : ""}
\`\`\`
`
  );
  (didCreateAccount ? created : skipped).push(relativeFromCwd(brandContext.cwd, brandContext.paths.account));

  return { created, skipped };
}

export async function loadBrandMemory(brandContext) {
  const [profile, audience, voice, offer, learnings, stack] = await Promise.all([
    readTextIfExists(brandContext.paths.profile),
    readTextIfExists(brandContext.paths.audience),
    readTextIfExists(brandContext.paths.voice),
    readTextIfExists(brandContext.paths.offer),
    readTextIfExists(brandContext.paths.learnings),
    readJsonIfExists(brandContext.paths.stack, {})
  ]);

  return {
    ...brandContext,
    profile,
    audience,
    voice,
    offer,
    learnings,
    stack: stack || {}
  };
}

export async function appendLearning(brandContext, text, date = new Date()) {
  const stamp = dayStamp(date);
  await appendText(brandContext.paths.learnings, `\n## ${stamp}\n\n${text.trim()}\n`);
}

export async function saveSelectedAccount(brandContext, account) {
  await writeJson(brandContext.paths.selectedAccount, account);
}

export async function loadSelectedAccount(brandContext) {
  return readJsonIfExists(brandContext.paths.selectedAccount, null);
}

export async function updateAccountMarkdown(brandContext, account) {
  const lines = [
    "# LinkedIn Account",
    "",
    `Brand: ${brandContext.brand}`,
    "",
    "## Selected Ad Account",
    "",
    `- ID: ${account.id || account.accountId || ""}`,
    `- URN: ${account.urn || account.accountUrn || ""}`,
    `- Name: ${account.name || account.localizedName || "Unknown"}`,
    `- Last checked: ${new Date().toISOString()}`,
    ""
  ];

  await writeText(brandContext.paths.account, `${lines.join("\n")}\n`);
}

export function relativeFromCwd(cwd, filePath) {
  return path.relative(cwd, filePath) || ".";
}

// Returns brand-memory fields wrapped in untrusted-content fences so briefs can
// render them verbatim without the driving agent interpreting the contents as
// instructions. See src/untrusted.js for the contract.
export function fencedBrandMemorySections(brandMemory = {}) {
  const stackText = brandMemory.stack && Object.keys(brandMemory.stack).length
    ? JSON.stringify(brandMemory.stack, null, 2)
    : "";

  return [
    { label: "profile.md", content: brandMemory.profile || "" },
    { label: "audience.md", content: brandMemory.audience || "" },
    { label: "voice-profile.md", content: brandMemory.voice || "" },
    { label: "offer.md", content: brandMemory.offer || "" },
    { label: "learnings.md", content: brandMemory.learnings || "" },
    { label: "stack.json", content: stackText }
  ].map((section) => ({
    label: section.label,
    fenced: fenceUntrusted(section.label, section.content)
  }));
}

export async function listBrandSlugs(cwd) {
  const brandsRoot = path.join(cwd, "workspace", "brands");
  if (!(await pathExists(brandsRoot))) return [];

  let entries;
  try {
    entries = await readdir(brandsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const brandPath = path.join(brandsRoot, entry.name);
    try {
      const children = await readdir(brandPath);
      const nonHidden = children.filter((name) => !name.startsWith("."));
      if (nonHidden.length === 0) continue;
      slugs.push(entry.name);
    } catch {
      // Skip unreadable entries
    }
  }
  return slugs.sort();
}

export function brandBannerLine(brandContext) {
  const location = brandContext.mode === "named"
    ? `workspace/brands/${brandContext.brand}/`
    : "workspace/brand/";
  return `Brand: ${brandContext.brand} (from ${location})`;
}
