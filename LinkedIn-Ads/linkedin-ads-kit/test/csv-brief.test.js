import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/csv.js";
import { runCli } from "../src/cli.js";
import { pathExists, readTextIfExists } from "../src/files.js";

test("CSV parser handles quoted commas", () => {
  const rows = parseCsv('Campaign Name,Spend\n"Pipeline, CFO", "$1,200"\n');
  assert.equal(rows[0].campaign_name, "Pipeline, CFO");
  assert.equal(rows[0].spend, "$1,200");
});

test("export:brief writes brief and safe draft from CSV data", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const campaignsPath = path.join(cwd, "campaigns.csv");
  await writeFile(
    campaignsPath,
    "Campaign Name,Campaign URN,Status,Daily Budget,Impressions,Clicks,Spend,Leads\nBad Fit,urn:li:sponsoredCampaign:123,ACTIVE,100,20000,30,500,0\n",
    "utf8"
  );

  let output = "";
  await runCli(["export:brief", "--account", "999", "--campaigns", "campaigns.csv"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { output += text; } },
    stderr: { write: () => {} }
  });

  assert.match(output, /Brief written/);
  assert.match(output, /Draft written/);
  assert.equal(await pathExists(path.join(cwd, "workspace/brand/learnings.md")), true);

  const learnings = await readTextIfExists(path.join(cwd, "workspace/brand/learnings.md"));
  assert.match(learnings, /Generated export brief/);
});
