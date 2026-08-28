import { URLSearchParams } from "node:url";
import path from "node:path";
import { linkedinApiVersion } from "../env.js";
import { ensureDir, fileModeBits, readJsonIfExists, writeJson } from "../files.js";
import { REQUEST_TIMEOUT_MS, LinkedInApiError } from "./client.js";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const DEFAULT_SCOPES = [
  "r_ads",
  "rw_ads",
  "r_ads_reporting",
  "r_marketing_leadgen_automation"
];

export const TOKEN_FILE_MODE = 0o600;
export const TOKEN_DIR_MODE = 0o700;

export function buildAuthUrl({ env = process.env, state = "linkedin-ads-kit", scopes = DEFAULT_SCOPES }) {
  requireEnv(env, "LINKEDIN_CLIENT_ID");
  requireEnv(env, "LINKEDIN_REDIRECT_URI");

  const url = new URL(AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.LINKEDIN_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.LINKEDIN_REDIRECT_URI);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scopes.join(" "));
  return url.toString();
}

export async function exchangeCodeForToken({ code, env = process.env, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS }) {
  requireEnv(env, "LINKEDIN_CLIENT_ID");
  requireEnv(env, "LINKEDIN_CLIENT_SECRET");
  requireEnv(env, "LINKEDIN_REDIRECT_URI");
  if (!code) throw new Error("Missing OAuth code.");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.LINKEDIN_REDIRECT_URI,
    client_id: env.LINKEDIN_CLIENT_ID,
    client_secret: env.LINKEDIN_CLIENT_SECRET
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw new LinkedInApiError(`LinkedIn API request timed out after ${timeoutMs}ms`, {
        status: undefined,
        body: null,
        url: TOKEN_URL
      });
    }
    throw error;
  }
  clearTimeout(timer);

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse LinkedIn OAuth token response (${response.status}): ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`LinkedIn OAuth token exchange failed (${response.status}): ${text}`);
  }

  return {
    ...parsed,
    apiVersion: linkedinApiVersion(env),
    expiresAt: parsed.expires_in ? new Date(Date.now() + parsed.expires_in * 1000).toISOString() : null
  };
}

export async function saveToken(brandContext, token) {
  // Cache directory holds the OAuth token and other secrets. Restrict it to the
  // current user so other local accounts cannot enumerate or read its contents
  // on shared hosts.
  await ensureDir(path.dirname(brandContext.paths.token), { mode: TOKEN_DIR_MODE });
  await writeJson(brandContext.paths.token, token, {
    dirMode: TOKEN_DIR_MODE,
    fileMode: TOKEN_FILE_MODE
  });
}

const EXPIRY_WARN_MS = 24 * 60 * 60 * 1000;

export function tokenExpiryStatus(token, now = new Date()) {
  if (!token?.expiresAt) return { state: "unknown" };
  const expiresAtMs = Date.parse(token.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return { state: "unknown" };

  const msUntilExpiry = expiresAtMs - now.getTime();
  if (msUntilExpiry <= 0) {
    return { state: "expired", msUntilExpiry };
  }
  if (msUntilExpiry <= EXPIRY_WARN_MS) {
    return { state: "expiring_soon", msUntilExpiry };
  }
  return { state: "fresh", msUntilExpiry };
}

function formatDuration(ms) {
  const absMs = Math.abs(ms);
  const hours = Math.round(absMs / (60 * 60 * 1000));
  if (hours < 48) return `${hours}h`;
  const days = Math.round(absMs / (24 * 60 * 60 * 1000));
  return `${days}d`;
}

function authCommandHint(brandContext) {
  if (brandContext?.mode === "named" && brandContext.brand) {
    return `npm run auth -- --brand ${brandContext.brand}`;
  }
  return "npm run auth";
}

export async function loadToken(brandContext, env = process.env, options = {}) {
  const stderr = options.stderr || process.stderr;
  const now = options.now || new Date();

  if (env.LINKEDIN_ACCESS_TOKEN) {
    return {
      access_token: env.LINKEDIN_ACCESS_TOKEN,
      apiVersion: linkedinApiVersion(env),
      source: "env"
    };
  }

  const mode = await fileModeBits(brandContext.paths.token);
  if (mode !== null && (mode & 0o077) !== 0) {
    const octal = mode.toString(8).padStart(3, "0");
    stderr.write(`Warning: LinkedIn OAuth token at ${brandContext.paths.token} has permissions 0${octal} that are wider than 0600. Other local users may be able to read this secret. Run: chmod 600 "${brandContext.paths.token}"\n`);
  }

  const token = await readJsonIfExists(brandContext.paths.token, null);
  if (!token) return null;

  const status = tokenExpiryStatus(token, now);
  const hint = authCommandHint(brandContext);

  if (status.state === "expired") {
    const ago = formatDuration(status.msUntilExpiry);
    stderr.write(`EXPIRED - API calls will fail. Re-authenticate now: ${hint} (expired ${ago} ago)\n`);
  } else if (status.state === "expiring_soon") {
    const remaining = formatDuration(status.msUntilExpiry);
    stderr.write(`LinkedIn access token expires in ${remaining}. Re-authenticate soon: ${hint}\n`);
  }

  return { ...token, source: "workspace", expiryStatus: status.state };
}

function requireEnv(env, key) {
  if (!env[key]) {
    throw new Error(`Missing ${key}. Add it to .env or your shell environment.`);
  }
}
