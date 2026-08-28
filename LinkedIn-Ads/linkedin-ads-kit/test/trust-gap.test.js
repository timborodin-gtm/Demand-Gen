import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { findTrustGapCandidates, LOW_CTR_TRUST_GAP_PCT, summarizeCampaignRows } from "../src/metrics.js";
import { runCli } from "../src/cli.js";
import { readTextIfExists } from "../src/files.js";

test("LOW_CTR_TRUST_GAP_PCT reflects the 0.4% company-page feed benchmark", () => {
  assert.equal(LOW_CTR_TRUST_GAP_PCT, 0.4);
});

test("findTrustGapCandidates flags company-page ads with spend, weak CTR, and few leads", () => {
  const rows = [
    {
      campaign_name: "Company Page Demo",
      campaign_urn: "urn:li:sponsoredCampaign:101",
      format: "single_image",
      status: "ACTIVE",
      impressions: "80000",
      clicks: "200",
      spend: "800",
      leads: "1"
    },
    {
      campaign_name: "Founder POV",
      campaign_urn: "urn:li:sponsoredCampaign:102",
      format: "thought_leader",
      status: "ACTIVE",
      impressions: "40000",
      clicks: "90",
      spend: "650",
      leads: "1"
    },
    {
      campaign_name: "Strong Company Page",
      campaign_urn: "urn:li:sponsoredCampaign:103",
      format: "company_page",
      status: "ACTIVE",
      impressions: "30000",
      clicks: "400",
      spend: "400",
      leads: "0"
    }
  ];

  const { campaigns, trustGapCandidates } = summarizeCampaignRows(rows);
  assert.equal(campaigns.length, 3);
  const names = trustGapCandidates.map((candidate) => candidate.name);
  assert.deepEqual(names, ["Company Page Demo"]);
});

test("findTrustGapCandidates returns an empty list when no campaigns match", () => {
  const rows = [
    {
      campaign_name: "Thought Leader Only",
      campaign_urn: "urn:li:sponsoredCampaign:201",
      format: "thought_leader",
      status: "ACTIVE",
      impressions: "40000",
      clicks: "80",
      spend: "650",
      leads: "1"
    },
    {
      campaign_name: "Healthy Company Page",
      campaign_urn: "urn:li:sponsoredCampaign:202",
      format: "single_image",
      status: "ACTIVE",
      impressions: "20000",
      clicks: "300",
      spend: "400",
      leads: "10"
    }
  ];

  const candidates = findTrustGapCandidates(summarizeCampaignRows(rows).campaigns);
  assert.deepEqual(candidates, []);
});

test("Trust Gap can coexist with Fake Signal when different campaigns match each state", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-trust-gap-"));
  await writeFile(
    path.join(cwd, "campaigns.csv"),
    [
      "Campaign Name,Campaign URN,Format,Status,Daily Budget,Impressions,Clicks,Spend,Leads",
      "Trust Gap Demo,urn:li:sponsoredCampaign:301,single_image,ACTIVE,100,80000,200,800,1",
      "Fake Signal Demo,urn:li:sponsoredCampaign:302,thought_leader,ACTIVE,200,40000,400,2400,0"
    ].join("\n"),
    "utf8"
  );

  await runCli(["daily:brief", "--campaigns", "campaigns.csv"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: () => {} },
    stderr: { write: () => {} }
  });

  const brief = await readNewestBrief(cwd, "-daily-brief.md");
  assert.match(brief, /## Fake Signal/);
  assert.match(brief, /Fake Signal Demo spent \$2,400 with no lead signal/);
  assert.match(brief, /## Trust Gap/);
  assert.match(brief, /Trust Gap Demo/);
});

test("daily brief omits the Trust Gap section when no campaign qualifies", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-no-trust-gap-"));
  await writeFile(
    path.join(cwd, "campaigns.csv"),
    [
      "Campaign Name,Campaign URN,Format,Status,Daily Budget,Impressions,Clicks,Spend,Leads",
      "Healthy Page,urn:li:sponsoredCampaign:401,single_image,ACTIVE,150,20000,300,400,10"
    ].join("\n"),
    "utf8"
  );

  await runCli(["daily:brief", "--campaigns", "campaigns.csv"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: () => {} },
    stderr: { write: () => {} }
  });

  const brief = await readNewestBrief(cwd, "-daily-brief.md");
  assert.doesNotMatch(brief, /## Trust Gap/);
});

test("Trust Gap lines defuse formula injection in campaign name and variant", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-trust-gap-defuse-"));
  await writeFile(
    path.join(cwd, "campaigns.csv"),
    [
      "Campaign Name,Campaign URN,Format,Status,Daily Budget,Impressions,Clicks,Spend,Leads",
      "\"=HYPERLINK(\"\"http://evil.example.com\"\",\"\"click\"\")\",urn:li:sponsoredCampaign:501,+CMD,ACTIVE,100,80000,120,800,1"
    ].join("\n"),
    "utf8"
  );

  await runCli(["daily:brief", "--campaigns", "campaigns.csv"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: () => {} },
    stderr: { write: () => {} }
  });

  const brief = await readNewestBrief(cwd, "-daily-brief.md");
  assert.match(brief, /## Trust Gap/);
  assert.match(brief, /'=HYPERLINK/);
  assert.match(brief, /\('\+CMD\)/);
  assert.doesNotMatch(brief, /- =HYPERLINK/);
  assert.doesNotMatch(brief, /\(\+CMD\)/);
});

async function readNewestBrief(cwd, suffix) {
  const briefDir = path.join(cwd, "workspace/brand/linkedin/briefs");
  const files = (await readdir(briefDir)).filter((file) => file.endsWith(suffix)).sort();
  assert.ok(files.length > 0, `expected a brief with suffix ${suffix}`);
  return readTextIfExists(path.join(briefDir, files.at(-1)));
}
