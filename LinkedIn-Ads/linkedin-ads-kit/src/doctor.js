import path from "node:path";
import { readdir } from "node:fs/promises";
import { isValidLinkedInApiVersion, linkedinApiVersion } from "./env.js";
import { pathExists, readTextIfExists } from "./files.js";
import { loadToken, tokenExpiryStatus } from "./linkedin/auth.js";
import { LinkedInClient } from "./linkedin/client.js";

const REQUIRED_ENV = [
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_REDIRECT_URI"
];

const REQUIRED_BRAND_FILES = [
  ["profile", "profile.md"],
  ["audience", "audience.md"],
  ["voice", "voice-profile.md"],
  ["offer", "offer.md"],
  ["stack", "stack.json"],
  ["learnings", "learnings.md"]
];

export async function runDoctor({ brandContext, env = process.env, fetchImpl = globalThis.fetch, checkApi = true, stderr = process.stderr, now = new Date() }) {
  const coldClone = await isColdClone(brandContext);
  if (coldClone) {
    return { ok: true, coldClone: true, checks: [] };
  }

  const checks = [];

  const version = linkedinApiVersion(env);
  checks.push({
    name: "LinkedIn API version",
    ok: isValidLinkedInApiVersion(version),
    detail: version
  });

  for (const key of REQUIRED_ENV) {
    checks.push({
      name: key,
      ok: Boolean(env[key]),
      detail: env[key] ? "set" : "missing"
    });
  }

  for (const [key, fileName] of REQUIRED_BRAND_FILES) {
    const filePath = brandContext.paths[key];
    const exists = await pathExists(filePath);
    if (!exists) {
      checks.push({
        name: `brand ${fileName}`,
        ok: false,
        severity: "fail",
        detail: `${filePath} (missing - run brand:init)`
      });
      continue;
    }

    // A file that exists but still holds the template prompts is "soft FAIL":
    // the operator just hasn't filled it in yet. Degrade to WARN so cold starts
    // don't scare operators who are mid-setup.
    const defaultTemplate = await isDefaultTemplate(filePath);
    if (defaultTemplate) {
      checks.push({
        name: `brand ${fileName}`,
        ok: true,
        severity: "warn",
        detail: `${filePath} (still holds the template - fill in brand specifics)`
      });
      continue;
    }

    checks.push({
      name: `brand ${fileName}`,
      ok: true,
      detail: filePath
    });
  }

  const token = await loadToken(brandContext, env, { stderr, now });
  checks.push({
    name: "LinkedIn access token",
    ok: Boolean(token?.access_token),
    detail: token?.source || "missing"
  });

  if (token?.expiresAt) {
    const status = tokenExpiryStatus(token, now);
    checks.push({
      name: "LinkedIn token expiry",
      ok: status.state !== "expired",
      detail: status.state === "expired"
        ? `expired (${token.expiresAt})`
        : status.state === "expiring_soon"
          ? `expiring soon (${token.expiresAt})`
          : `valid (${token.expiresAt})`
    });
  }

  if (token?.access_token && checkApi) {
    try {
      const client = new LinkedInClient({
        accessToken: token.access_token,
        apiVersion: version,
        fetchImpl
      });
      await client.getAdAccounts();
      checks.push({
        name: "LinkedIn API account read",
        ok: true,
        detail: "adAccounts reachable"
      });
    } catch (error) {
      checks.push({
        name: "LinkedIn API account read",
        ok: false,
        detail: error.message
      });
    }
  }

  const ok = checks.every((check) => check.ok);
  return {
    ok,
    coldClone: false,
    checks
  };
}

export function renderDoctor(result) {
  if (result.coldClone) {
    return [
      "# LinkedIn Ads Kit Doctor",
      "",
      "---",
      "",
      "No brand workspace found. Run `./install.sh` or `npm run brand:init` first.",
      "",
      "---",
      "",
      "(Doctor will do full checks after a brand is initialized.)"
    ].join("\n");
  }

  const lines = ["# LinkedIn Ads Kit Doctor", ""];
  for (const check of result.checks) {
    const label = check.severity === "warn" ? "WARN" : check.ok ? "PASS" : "FAIL";
    lines.push(`${label} ${check.name}: ${check.detail}`);
  }
  const hasFail = result.checks.some((check) => check.severity !== "warn" && !check.ok);
  lines.push("", hasFail ? "Some checks failed. Fix the FAIL items above." : "All checks passed.");
  return lines.join("\n");
}

// A "cold clone" is a workspace that has never been initialized: no default
// brand AND no named brands. In that state a fresh operator sees every FAIL
// line and assumes the kit is broken, when in fact they just need to run
// `./install.sh` or `npm run brand:init`.
async function isColdClone(brandContext) {
  const workspaceRoot = brandContext.workspaceRoot;
  const defaultProfile = path.join(workspaceRoot, "brand", "profile.md");
  if (await pathExists(defaultProfile)) return false;

  const brandsRoot = path.join(workspaceRoot, "brands");
  if (!(await pathExists(brandsRoot))) return true;

  let entries;
  try {
    entries = await readdir(brandsRoot, { withFileTypes: true });
  } catch {
    return true;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await pathExists(path.join(brandsRoot, entry.name, "profile.md"))) {
      return false;
    }
  }

  return true;
}

async function isDefaultTemplate(filePath) {
  if (!filePath.endsWith(".md")) return false;
  const content = await readTextIfExists(filePath, "");
  if (!content) return false;
  return /What market do you compete in\?/.test(content)
    || /Who should LinkedIn Ads reach\?/.test(content)
    || /How should the brand sound\?/.test(content)
    || /What are we asking the buyer to do\?/.test(content)
    || /Append durable performance and buyer-quality insights here\./.test(content);
}
