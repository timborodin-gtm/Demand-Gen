import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { loadExportInputs, writeBrief } from "./brief.js";
import { runDailyBrief } from "./daily.js";
import { fileStamp } from "./dates.js";
import { linkedinApiVersion } from "./env.js";
import { ensureDir, readJsonIfExists, writeIfMissing, writeText } from "./files.js";
import {
  buildThoughtLeaderLaunchPacket,
  buildThoughtLeaderScorecard,
  parsePostFile,
  renderThoughtLeaderScorecard
} from "./thoughtLeaderAds.js";
import { loadBrandMemory, relativeFromCwd } from "./workspace.js";

const EXAMPLE_BRAND_FILES = {
  "profile.md": "profile.md",
  "audience.md": "audience.md",
  "voice-profile.md": "voice-profile.md",
  "offer.md": "offer.md",
  "stack.json": "stack.json"
};

export async function runDemo({ cwd, brandContext, env = process.env, stdout = process.stdout }) {
  await seedExampleBrand({ cwd, brandContext });

  const campaignsPath = path.join(cwd, "examples", "exports", "linkedin-campaigns.csv");
  const leadsPath = path.join(cwd, "examples", "exports", "linkedin-leads.csv");
  const crmPath = path.join(cwd, "examples", "exports", "crm-leads.csv");

  const inputData = await loadExportInputs({
    campaigns: campaignsPath,
    leads: leadsPath,
    crm: crmPath
  });

  const brandMemory = await loadBrandMemory(brandContext);
  const dailyResult = await runDailyBrief({
    brandContext,
    brandMemory,
    env,
    args: {
      campaigns: campaignsPath,
      leads: leadsPath,
      crm: crmPath,
      account: brandMemory.stack?.linkedinAdAccountId || "example-export"
    }
  });
  const result = await writeBrief({
    brandContext,
    brandMemory,
    source: "demo",
    inputData,
    connectedMeta: {
      apiVersion: linkedinApiVersion(env),
      accountId: brandMemory.stack?.linkedinAdAccountId || "example-export"
    }
  });

  const posts = await loadExamplePosts({ cwd });
  const scorecard = buildThoughtLeaderScorecard({ posts, brandMemory });
  const scorecardMarkdown = renderThoughtLeaderScorecard({ scorecard, brandMemory });
  const scorecardPath = path.join(brandContext.paths.briefs, `${fileStamp()}-thought-leader-scorecard.md`);
  await writeText(scorecardPath, scorecardMarkdown);

  let launchPacketPath = null;
  if (scorecard.top) {
    const launchPacketMarkdown = buildThoughtLeaderLaunchPacket({
      post: scorecard.top.post,
      score: scorecard.top.score,
      brandMemory,
      campaign: { budget: "$100/day test budget" }
    });
    launchPacketPath = path.join(
      brandContext.paths.drafts,
      `${fileStamp()}-thought-leader-launch-packet.md`
    );
    await writeText(launchPacketPath, launchPacketMarkdown);
  }

  stdout.write(`Demo brand: ${brandContext.brand}\n`);
  stdout.write(`Daily brief written: ${relativeFromCwd(cwd, dailyResult.briefPath)}\n`);
  stdout.write(`Brief written: ${relativeFromCwd(cwd, result.briefPath)}\n`);
  if (result.draftPath) stdout.write(`Draft written: ${relativeFromCwd(cwd, result.draftPath)}\n`);
  stdout.write(`Thought Leader scorecard written: ${relativeFromCwd(cwd, scorecardPath)}\n`);
  if (launchPacketPath) {
    stdout.write(`Thought Leader launch packet written: ${relativeFromCwd(cwd, launchPacketPath)}\n`);
  }

  const summary = renderDemoCompleteSummary({
    cwd,
    dailyBriefPath: dailyResult.briefPath,
    briefPath: result.briefPath,
    draftPath: result.draftPath,
    scorecardPath,
    launchPacketPath,
    scorecard,
    postsCount: posts.length
  });
  stdout.write(`\n${summary}`);

  return {
    ...result,
    dailyBriefPath: dailyResult.briefPath,
    scorecardPath,
    launchPacketPath,
    scorecard
  };
}

async function loadExamplePosts({ cwd }) {
  const postsDir = path.join(cwd, "examples", "posts");
  let entries = [];
  try {
    entries = await readdir(postsDir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const files = entries.filter((name) => name.toLowerCase().endsWith(".md")).sort();
  const posts = [];
  for (const name of files) {
    const content = await readFile(path.join(postsDir, name), "utf8");
    posts.push(parsePostFile({ content, filename: name }));
  }
  return posts;
}

function renderDemoCompleteSummary({
  cwd,
  dailyBriefPath,
  briefPath,
  draftPath,
  scorecardPath,
  launchPacketPath,
  scorecard,
  postsCount
}) {
  const dailyRel = relativeFromCwd(cwd, dailyBriefPath);
  const briefRel = relativeFromCwd(cwd, briefPath);
  const draftRel = draftPath ? relativeFromCwd(cwd, draftPath) : null;
  const scorecardRel = relativeFromCwd(cwd, scorecardPath);
  const launchRel = launchPacketPath ? relativeFromCwd(cwd, launchPacketPath) : null;

  const headline = scorecard?.top
    ? `Top Thought Leader post: "${scorecard.top.post.author}" at ${scorecard.top.score.total}/100 (${scorecard.top.score.recommendation}).`
    : postsCount === 0
    ? "No example posts detected; Thought Leader scorecard is empty."
    : "No scorable posts in this run.";

  const lines = [];
  lines.push("=== Demo Complete ===");
  lines.push("");
  lines.push(headline);
  lines.push("");
  lines.push("Open these files in priority order:");
  lines.push(`  1. Daily management brief:        ${dailyRel}`);
  lines.push(`  2. Thought Leader Ads scorecard:  ${scorecardRel}`);
  if (launchRel) {
    lines.push(`  3. Top-post launch packet:        ${launchRel}`);
  }
  lines.push(`  ${launchRel ? "4" : "3"}. Deeper export brief:            ${briefRel}`);
  if (draftRel) {
    lines.push(`  ${launchRel ? "5" : "4"}. Pause-campaign safe draft:      ${draftRel}`);
  }
  lines.push("");
  lines.push("Next step: open the scorecard and the launch packet. The rest of the kit exists to make that post sponsorable safely.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function seedExampleBrand({ cwd, brandContext }) {
  await ensureDir(brandContext.brandRoot);
  await ensureDir(brandContext.paths.briefs);
  await ensureDir(brandContext.paths.drafts);
  await ensureDir(brandContext.paths.auditTrail);
  await ensureDir(brandContext.paths.cache);

  for (const [targetFile, sourceFile] of Object.entries(EXAMPLE_BRAND_FILES)) {
    const content = await readFile(path.join(cwd, "examples", "brand", sourceFile), "utf8");
    await writeIfMissing(path.join(brandContext.brandRoot, targetFile), content);
  }

  await writeIfMissing(
    brandContext.paths.learnings,
    `# Learnings

This demo workspace uses sanitized example data.
`
  );

  const stack = await readJsonIfExists(brandContext.paths.stack, {});
  await writeIfMissing(
    brandContext.paths.account,
    `# LinkedIn Account

Brand: ${brandContext.brand}

## Selected Ad Account

Demo export mode. No live LinkedIn account is connected.

## Benchmarks

- Target CPL: ${stack?.targetCpl || "n/a"}
- Target qualified lead cost: ${stack?.targetCostPerQualifiedLead || "n/a"}
`
  );
}

