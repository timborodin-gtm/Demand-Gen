import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { runConnectedBrief } from "../src/connected.js";
import { initBrandWorkspace, loadBrandMemory, resolveBrand } from "../src/workspace.js";
import { pathExists, readJsonIfExists } from "../src/files.js";

const FIXTURE_ROOT = new URL("./fixtures/linkedin/", import.meta.url);
const FIXTURE_FILES = {
  accounts: "accounts.json",
  campaignGroups: "campaign-groups.json",
  campaigns: "campaigns.json",
  creatives: "creatives.json",
  adAnalytics: "ad-analytics.json",
  leadForms: "lead-forms.json",
  leadSyncDenied: "lead-sync-denied.json"
};

test("connected brief uses LinkedIn API fixtures and degrades Lead Sync denial", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const brand = resolveBrand({ cwd, brand: "acme" });
  await initBrandWorkspace(brand);
  const memory = await loadBrandMemory(brand);
  const fixtures = await loadLinkedInFixtures();
  const calls = [];
  const fetchImpl = createLinkedInFixtureFetch(fixtures, calls);

  const result = await runConnectedBrief({
    brandContext: brand,
    brandMemory: memory,
    token: { access_token: "token" },
    env: { LINKEDIN_API_VERSION: "202604" },
    fetchImpl
  });

  const cachePath = path.join(cwd, "workspace/brands/acme/linkedin/cache/last-connected-pull.json");
  const cache = await readJsonIfExists(cachePath);
  const leadResponseCall = calls.find((call) => new URL(call.url).pathname.endsWith("/leadFormResponses"));

  assert.equal(await pathExists(result.briefPath), true);
  assert.equal(await pathExists(result.draftPath), true);
  assert.equal(await pathExists(cachePath), true);
  assert.equal(cache.account.id, "999");
  assert.equal(cache.campaigns.data.elements.length, fixtures.campaigns.elements.length);
  assert.equal(cache.creatives.data.elements.length, fixtures.creatives.elements.length);
  assert.equal(cache.leadForms.data.elements.length, fixtures.leadForms.elements.length);
  assert.match(cache.leadResponses.error, /LinkedIn API 403/);
  assert.ok(result.warnings.some((warning) => warning.label === "leadFormResponses"));
  assert.equal(result.warnings.some((warning) => warning.label === "leadForms"), false);
  assert.ok(leadResponseCall);
  assert.match(leadResponseCall.url, /versionedLeadGenFormUrn=/);
  assert.ok(calls.every((call) => call.options.headers["Linkedin-Version"] === "202604"));
  assert.ok(calls.every((call) => call.options.headers["X-Restli-Protocol-Version"] === "2.0.0"));
});

async function loadLinkedInFixtures() {
  const entries = await Promise.all(Object.entries(FIXTURE_FILES).map(async ([key, fileName]) => {
    const content = await readFile(new URL(fileName, FIXTURE_ROOT), "utf8");
    return [key, JSON.parse(content)];
  }));

  return Object.fromEntries(entries);
}

function createLinkedInFixtureFetch(fixtures, calls = []) {
  return async (url, options) => {
    calls.push({ url: url.toString(), options });
    const pathname = url.pathname;

    if (pathname.endsWith("/adAccounts")) return json(fixtures.accounts);
    if (pathname.includes("/adCampaignGroups")) return json(fixtures.campaignGroups);
    if (pathname.includes("/adCampaigns")) return json(fixtures.campaigns);
    if (pathname.includes("/creatives")) return json(fixtures.creatives);
    if (pathname.endsWith("/adAnalytics")) return json(fixtures.adAnalytics);
    if (pathname.endsWith("/leadForms")) return json(fixtures.leadForms);
    if (pathname.endsWith("/leadFormResponses")) return json(fixtures.leadSyncDenied, 403);

    return json({});
  };
}

function json(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    text: async () => JSON.stringify(value)
  };
}
