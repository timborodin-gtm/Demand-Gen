import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/cli.js";
import { readTextIfExists } from "../src/files.js";

test("daily:brief writes a read-only LinkedIn Ads management brief", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-daily-"));
  await writeDailyFixtures(cwd);

  let output = "";
  await runCli(["daily:brief", "--account", "999", "--campaigns", "campaigns.csv", "--leads", "leads.csv", "--crm", "crm.csv"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { output += text; } },
    stderr: { write: () => {} }
  });

  assert.match(output, /Daily brief written/);

  const brief = await readNewestBrief(cwd);
  assert.match(brief, /# LinkedIn Ads Daily Brief/);
  assert.match(brief, /The 5 Daily LinkedIn Ads Questions/);
  assert.match(brief, /Real Signal/);
  assert.match(brief, /Fake Signal/);
  assert.match(brief, /Leaks/);
  assert.match(brief, /Today's Moves/);
  assert.match(brief, /Do Not Touch Yet/);
  assert.match(brief, /read-only/i);
  assert.match(brief, /Generic Demo/);

  const learnings = await readTextIfExists(path.join(cwd, "workspace/brand/learnings.md"));
  assert.match(learnings, /Generated daily brief/);
});

test("daily-check aliases the daily brief workflow", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-daily-alias-"));
  await writeDailyFixtures(cwd);

  let output = "";
  await runCli(["daily-check", "--account", "999", "--campaigns", "campaigns.csv"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { output += text; } },
    stderr: { write: () => {} }
  });

  assert.match(output, /Daily brief written/);
  const brief = await readNewestBrief(cwd);
  assert.match(brief, /LOW - media-only/);
});

async function writeDailyFixtures(cwd) {
  await writeFile(
    path.join(cwd, "campaigns.csv"),
    [
      "Campaign Name,Campaign URN,Status,Daily Budget,Impressions,Clicks,Spend,Leads",
      "CFO Pain Thought Leader,urn:li:sponsoredCampaign:111,ACTIVE,150,40000,420,650,3",
      "Generic Demo,urn:li:sponsoredCampaign:222,ACTIVE,200,50000,80,2400,0"
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    path.join(cwd, "leads.csv"),
    [
      "First Name,Email,Company,Job Title,Campaign Name,Status,Sales Notes",
      "Avery,avery@example.com,ExampleCo,CFO,CFO Pain Thought Leader,Opportunity,qualified buyer",
      "Sam,sam@example.com,Student Project,Student,Generic Demo,Disqualified,student bad fit"
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    path.join(cwd, "crm.csv"),
    [
      "Email,Company,Job Title,Campaign Name,CRM Stage,CRM Notes",
      "riley@example.com,Midmarket Co,VP Marketing,CFO Pain Thought Leader,Sales Accepted,pipeline conversation"
    ].join("\n"),
    "utf8"
  );
}

async function readNewestBrief(cwd) {
  const briefDir = path.join(cwd, "workspace/brand/linkedin/briefs");
  const files = (await readdir(briefDir)).filter((file) => file.endsWith("-daily-brief.md")).sort();
  assert.ok(files.length > 0);
  return readTextIfExists(path.join(briefDir, files.at(-1)));
}
