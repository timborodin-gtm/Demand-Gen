import path from "node:path";
import { parseArgs } from "./args.js";
import { loadLocalEnv, linkedinApiVersion } from "./env.js";
import { brandBannerLine, initBrandWorkspace, listBrandSlugs, loadBrandMemory, resolveBrand, relativeFromCwd } from "./workspace.js";
import { buildAuthUrl, exchangeCodeForToken, loadToken, saveToken } from "./linkedin/auth.js";
import { LinkedInClient } from "./linkedin/client.js";
import { loadExportInputs, writeBrief } from "./brief.js";
import { runDailyBrief } from "./daily.js";
import { writeDraft } from "./draft.js";
import { applyDraft } from "./apply.js";
import { runConnectedBrief } from "./connected.js";
import { renderDoctor, runDoctor } from "./doctor.js";
import { runDemo } from "./demo.js";

export async function runCli(argv, options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = { ...(options.env || process.env) };
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  await loadLocalEnv(cwd, env);

  const [command = "help", ...rest] = argv;
  const args = parseArgs(rest);

  if (command === "help" || command === "--help" || command === "-h") {
    stdout.write(helpText());
    return { ok: true };
  }

  if (args.help || args.h) {
    stdout.write(commandHelpText(command));
    return { ok: true };
  }

  const brandContext = resolveBrand({ cwd, brand: command === "demo" && !args.brand ? "exampleco" : args.brand });

  const BRAND_EXEMPT_COMMANDS = new Set(["brand:init", "demo"]);
  if (!BRAND_EXEMPT_COMMANDS.has(command) && !args.brand) {
    const slugs = await listBrandSlugs(cwd);
    if (slugs.length > 0) {
      throw new Error(brandRequiredError(slugs));
    }
  }

  writeBrandBanner(stdout, brandContext);

  if (command === "brand:init") {
    const result = await initBrandWorkspace(brandContext);
    stdout.write(`Initialized ${brandContext.brand} brand workspace.\n\nCreated:\n${formatList(result.created)}\n\nSkipped existing:\n${formatList(result.skipped)}\n`);
    return { ok: true, result };
  }

  if (command === "demo") {
    const result = await runDemo({ cwd, brandContext, env, stdout });
    return { ok: true, result };
  }

  if (command === "doctor") {
    const result = await runDoctor({
      brandContext,
      env,
      fetchImpl,
      stderr,
      checkApi: !args.no_check_api && args.check_api !== false && args.check_api !== "false"
    });
    stdout.write(`${renderDoctor(result)}\n`);
    if (!result.ok) process.exitCode = 1;
    return result;
  }

  if (command === "auth") {
    await initBrandWorkspace(brandContext);
    if (args.code) {
      const token = await exchangeCodeForToken({ code: args.code, env, fetchImpl });
      await saveToken(brandContext, token);
      stdout.write(`Saved LinkedIn OAuth token for ${brandContext.brand}.\n`);
      return { ok: true, token };
    }

    const url = buildAuthUrl({ env, state: args.state || `linkedin-ads-kit-${brandContext.brand}` });
    stdout.write(`Open this URL to authorize LinkedIn Marketing API access:\n\n${url}\n\nThen run:\n\n${brandContext.mode === "named" ? `npm run auth -- --brand ${brandContext.brand} --code YOUR_CODE` : "npm run auth -- --code YOUR_CODE"}\n`);
    return { ok: true, url };
  }

  if (command === "export:brief") {
    await initBrandWorkspace(brandContext);
    const brandMemory = await loadBrandMemory(brandContext);
    const inputData = await loadExportInputs(resolveInputPaths(args, cwd));
    const result = await writeBrief({
      brandContext,
      brandMemory,
      source: "export",
      inputData,
      connectedMeta: {
        apiVersion: linkedinApiVersion(env),
        accountId: args.account || env.LINKEDIN_AD_ACCOUNT_ID || brandMemory.stack?.linkedinAdAccountId || ""
      }
    });
    stdout.write(`Brief written: ${relativeFromCwd(cwd, result.briefPath)}\n`);
    if (result.draftPath) stdout.write(`Draft written: ${relativeFromCwd(cwd, result.draftPath)}\n`);
    return { ok: true, result };
  }

  if (command === "connected:brief") {
    await initBrandWorkspace(brandContext);
    const brandMemory = await loadBrandMemory(brandContext);
    const token = await loadToken(brandContext, env, { stderr });
    if (!token?.access_token) {
      throw new Error("No LinkedIn access token found. Run npm run auth first or set LINKEDIN_ACCESS_TOKEN.");
    }
    const result = await runConnectedBrief({ brandContext, brandMemory, token, env, fetchImpl, args });
    stdout.write(`Connected brief written: ${relativeFromCwd(cwd, result.briefPath)}\n`);
    if (result.draftPath) stdout.write(`Draft written: ${relativeFromCwd(cwd, result.draftPath)}\n`);
    for (const warning of result.warnings) {
      stderr.write(`Warning: ${warning.label}: ${warning.error}\n`);
    }
    return { ok: true, result };
  }

  if (command === "daily:brief" || command === "daily-check") {
    await initBrandWorkspace(brandContext);
    const brandMemory = await loadBrandMemory(brandContext);
    const token = await loadToken(brandContext, env, { stderr });
    const result = await runDailyBrief({
      brandContext,
      brandMemory,
      token,
      env,
      fetchImpl,
      args: resolveInputPaths(args, cwd)
    });
    stdout.write(`Daily brief written: ${relativeFromCwd(cwd, result.briefPath)}\n`);
    for (const warning of result.warnings) {
      stderr.write(`Warning: ${warning.label}: ${warning.error}\n`);
    }
    return { ok: true, result };
  }

  if (command === "draft") {
    await initBrandWorkspace(brandContext);
    const brandMemory = await loadBrandMemory(brandContext);
    const result = await writeDraft({ brandContext, brandMemory, args });
    stdout.write(`Draft written: ${relativeFromCwd(cwd, result.draftPath)}\n`);
    return { ok: true, result };
  }

  if (command === "apply") {
    await initBrandWorkspace(brandContext);
    const token = await loadToken(brandContext, env, { stderr });
    if (!token?.access_token && !options.client) {
      throw new Error("No LinkedIn access token found. Run npm run auth first or set LINKEDIN_ACCESS_TOKEN.");
    }

    const client = options.client || new LinkedInClient({
      accessToken: token.access_token,
      apiVersion: linkedinApiVersion(env),
      fetchImpl
    });

    const result = await applyDraft({
      brandContext,
      draftPath: args.draft ? path.resolve(cwd, args.draft) : "",
      client,
      confirm: args.confirm,
      dryRun: Boolean(args.dry_run),
      skipDryRunCheck: Boolean(args.skip_dry_run_check),
      stderr
    });

    if (result.dryRun) {
      stdout.write(`Dry run passed for ${result.draft.actions.length} action(s).\nDry-run receipt: ${relativeFromCwd(cwd, result.sidecarPath)}\n`);
    } else {
      stdout.write(`Applied ${result.results.length} action(s).\nAudit written: ${relativeFromCwd(cwd, result.auditPath)}\n`);
    }
    return { ok: true, result };
  }

  throw new Error(`Unknown command: ${command}\n\n${helpText()}`);
}

function helpText() {
  return `LinkedIn Ads Kit

Commands:
  doctor
  auth
  brand:init [--brand <slug>]
  export:brief [--brand <slug>] --campaigns <csv> [--leads <csv>] [--crm <csv>]
  connected:brief [--brand <slug>]
  daily:brief [--brand <slug>] [--campaigns <csv>] [--leads <csv>] [--crm <csv>]
  daily-check [--brand <slug>] [--campaigns <csv>] [--leads <csv>] [--crm <csv>]
  draft [--brand <slug>] --action <action>
  apply [--brand <slug>] --draft <path> [--dry-run|--confirm APPLY] [--skip-dry-run-check]
  demo [--brand <slug>]
`;
}

function commandHelpText(command) {
  if (command === "draft") {
    return `LinkedIn Ads Kit: draft

Usage:
  npm run draft -- [--brand <slug>] --action <action> [options]

Actions:
  pause-campaign       --target <campaign-urn> --current <status> --ad-account-urn <account-urn>
  pause-creative       --target <creative-urn> --current <intendedStatus> --ad-account-urn <account-urn>
  set-daily-budget     --target <campaign-urn> --current <amount> --budget <amount> --ad-account-urn <account-urn>
  activate-creative    --target <creative-urn> --current <intendedStatus> --ad-account-urn <account-urn>
  thought-leader-ad    --post <url> --post-text <text> [--post-urn <urn> --campaign <urn>]

Brand rules:
  --brand is required when workspace/brands/ contains named brand workspaces.
  Without named brands, commands use workspace/brand/.
`;
  }

  if (command === "apply") {
    return `LinkedIn Ads Kit: apply

Usage:
  npm run apply -- [--brand <slug>] --draft <path> --dry-run
  npm run apply -- [--brand <slug>] --draft <path> --confirm APPLY

Safety rules:
  Drafts must live under the resolved brand's linkedin/drafts/ folder.
  Draft account URNs must match the selected account recorded for that brand.
  Live apply requires a matching dry-run receipt less than 24 hours old.
  The dry-run receipt is tied to the draft hash, brand, draft path, and per-brand signing key.
  --skip-dry-run-check bypasses this gate and prints a warning; reserve it for scripted recovery only.

Brand rules:
  --brand is required when workspace/brands/ contains named brand workspaces.
  Without named brands, commands use workspace/brand/.
`;
  }

  if (command === "doctor") {
    return `LinkedIn Ads Kit: doctor

Usage:
  npm run doctor -- [--no-check-api]

Options:
  --no-check-api   Skip the live LinkedIn ad account read.
`;
  }

  return helpText();
}

function formatList(values) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

export function brandRequiredError(slugs) {
  const listed = slugs.map((slug) => `  - ${slug}`).join("\n");
  return `--brand is required because named brands exist in workspace/brands/.\n\nAvailable brand slugs:\n${listed}\n\nRe-run with: --brand <slug>`;
}

function writeBrandBanner(stdout, brandContext) {
  stdout.write(`${brandBannerLine(brandContext)}\n`);
}

function resolveInputPaths(args, cwd) {
  return {
    ...args,
    campaigns: args.campaigns ? path.resolve(cwd, args.campaigns) : undefined,
    leads: args.leads ? path.resolve(cwd, args.leads) : undefined,
    crm: args.crm ? path.resolve(cwd, args.crm) : undefined
  };
}
