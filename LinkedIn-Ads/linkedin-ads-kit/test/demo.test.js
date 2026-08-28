import { cp, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/cli.js";
import { pathExists, readTextIfExists } from "../src/files.js";

test("demo seeds example brand and writes a brief plus draft", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-demo-"));
  let output = "";
  await copyExamples(cwd);

  await runCli(["demo"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { output += text; } },
    stderr: { write: () => {} }
  });

  assert.match(output, /Demo brand: exampleco/);
  assert.match(output, /Daily brief written:/);
  assert.match(output, /Brief written:/);
  assert.match(output, /Draft written:/);
  assert.match(output, /Thought Leader scorecard written:/);
  assert.match(output, /Thought Leader launch packet written:/);
  assert.match(output, /=== Demo Complete ===/);
  assert.match(output, /Top Thought Leader post: .+ \d+\/100/);
  assert.equal(await pathExists(path.join(cwd, "workspace/brands/exampleco/profile.md")), true);
});

test("demo writes a scorable Thought Leader scorecard and launch packet", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-demo-"));
  let output = "";
  await copyExamples(cwd);

  const result = await runCli(["demo"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { output += text; } },
    stderr: { write: () => {} }
  });

  const scorecardPath = result.result.scorecardPath;
  const launchPath = result.result.launchPacketPath;
  assert.ok(scorecardPath, "scorecard path was not returned");
  assert.ok(launchPath, "launch packet path was not returned");

  const scorecard = await readFile(scorecardPath, "utf8");
  assert.match(scorecard, /Thought Leader Ads Scorecard/);
  assert.match(scorecard, /\*\*Headline:\*\*/);
  assert.match(scorecard, /cfo-pain-pipeline-trust\.md/);
  assert.match(scorecard, /strong_candidate/);
  assert.match(scorecard, /manual_review/);
  assert.match(scorecard, /generic-thought-leader-bait\.md/);

  const launchPacket = await readFile(launchPath, "utf8");
  assert.match(launchPacket, /Thought Leader Ads Launch Packet/);
  assert.match(launchPacket, /ExampleCo Founder/);
  assert.match(launchPacket, /utm_source=linkedin/);
  assert.match(launchPacket, /Kill Criteria/);
  assert.match(launchPacket, /Pre-Launch Checklist/);
});

test("demo complete summary lists paths in priority order", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-demo-"));
  let output = "";
  await copyExamples(cwd);

  await runCli(["demo"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { output += text; } },
    stderr: { write: () => {} }
  });

  const summary = output.split("=== Demo Complete ===")[1];
  assert.ok(summary, "Demo Complete summary was not emitted");
  const dailyIndex = summary.search(/Daily management brief/);
  const scorecardIndex = summary.search(/Thought Leader Ads scorecard/);
  const launchIndex = summary.search(/Top-post launch packet/);
  const deeperIndex = summary.search(/Deeper export brief/);
  assert.ok(dailyIndex >= 0 && scorecardIndex > dailyIndex, "scorecard should appear after daily brief");
  assert.ok(launchIndex > scorecardIndex, "launch packet should appear after scorecard");
  assert.ok(deeperIndex > launchIndex, "deeper brief should appear after launch packet");
});

test("demo command works from an isolated repo copy", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-demo-"));
  let output = "";
  await copyExamples(cwd);

  await runCli(["demo", "--brand", "test-brand"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { output += text; } },
    stderr: { write: () => {} }
  });

  assert.match(output, /Demo brand: test-brand/);
  assert.equal(await pathExists(path.join(cwd, "workspace/brands/test-brand/profile.md")), true);
  const profile = await readTextIfExists(path.join(cwd, "workspace/brands/test-brand/profile.md"));
  assert.match(profile, /ExampleCo/);
});

async function copyExamples(cwd) {
  await cp(path.join(process.cwd(), "examples"), path.join(cwd, "examples"), { recursive: true });
}
