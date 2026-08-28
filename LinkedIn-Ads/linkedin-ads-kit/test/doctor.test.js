import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { renderDoctor, runDoctor } from "../src/doctor.js";
import { initBrandWorkspace, resolveBrand } from "../src/workspace.js";
import { runCli } from "../src/cli.js";

test("doctor short-circuits on a cold clone and exits 0", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-cold-clone-"));
  const brand = resolveBrand({ cwd });

  const result = await runDoctor({ brandContext: brand, env: {}, checkApi: false });
  const output = renderDoctor(result);

  assert.equal(result.ok, true);
  assert.equal(result.coldClone, true);
  assert.equal(result.checks.length, 0);
  assert.doesNotMatch(output, /FAIL /);
  assert.match(output, /No brand workspace found/);
  assert.match(output, /brand:init/);
});

test("doctor cli prints the cold-clone message without FAIL lines and without exit 1", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-cold-clone-cli-"));
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  let output = "";
  await runCli(["doctor", "--no-check-api"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { output += text; } },
    stderr: { write: () => {} }
  });

  assert.doesNotMatch(output, /FAIL /);
  assert.match(output, /No brand workspace found/);
  assert.notEqual(process.exitCode, 1);

  process.exitCode = previousExitCode;
});

test("helpText advertises daily-check alongside daily:brief", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-help-"));
  let output = "";
  await runCli(["help"], {
    cwd,
    env: {},
    stdout: { write: (text) => { output += text; } },
    stderr: { write: () => {} }
  });

  assert.match(output, /daily-check/);
  assert.match(output, /daily:brief/);
});

test("draft and apply command help render before brand guard or execution", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-command-help-"));
  await initBrandWorkspace(resolveBrand({ cwd, brand: "acme" }));

  let draftHelp = "";
  const draftResult = await runCli(["draft", "--help"], {
    cwd,
    env: {},
    stdout: { write: (text) => { draftHelp += text; } },
    stderr: { write: () => {} }
  });

  let applyHelp = "";
  const applyResult = await runCli(["apply", "--help"], {
    cwd,
    env: {},
    stdout: { write: (text) => { applyHelp += text; } },
    stderr: { write: () => {} }
  });

  assert.equal(draftResult.ok, true);
  assert.match(draftHelp, /Usage:/);
  assert.match(draftHelp, /--brand is required/);
  assert.match(draftHelp, /set-daily-budget/);

  assert.equal(applyResult.ok, true);
  assert.match(applyHelp, /Live apply requires a matching dry-run receipt/);
  assert.match(applyHelp, /24 hours/);
  assert.match(applyHelp, /--skip-dry-run-check/);
});

test("doctor --no-check-api skips the live API read", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-no-check-api-"));
  await initBrandWorkspace(resolveBrand({ cwd }));
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  let calls = 0;
  try {
    await runCli(["doctor", "--no-check-api"], {
      cwd,
      env: {
        LINKEDIN_API_VERSION: "202604",
        LINKEDIN_ACCESS_TOKEN: "token",
        LINKEDIN_CLIENT_ID: "client",
        LINKEDIN_CLIENT_SECRET: "secret",
        LINKEDIN_REDIRECT_URI: "http://localhost/callback"
      },
      stdout: { write: () => {} },
      stderr: { write: () => {} },
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          text: async () => JSON.stringify({ elements: [] })
        };
      }
    });
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.equal(calls, 0);
});
