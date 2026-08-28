import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/cli.js";
import { initBrandWorkspace, resolveBrand } from "../src/workspace.js";
import { pathExists } from "../src/files.js";

async function copyExamples(cwd) {
  await cp(path.join(process.cwd(), "examples"), path.join(cwd, "examples"), { recursive: true });
}

test("command without --brand fails loud when workspace/brands has an entry", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-cli-"));
  const brand = resolveBrand({ cwd, brand: "acme" });
  await initBrandWorkspace(brand);

  let stdout = "";
  let stderr = "";

  await assert.rejects(
    () => runCli(["draft", "--action", "pause-campaign", "--target", "urn:li:sponsoredCampaign:123", "--current", "ACTIVE"], {
      cwd,
      env: { LINKEDIN_API_VERSION: "202604" },
      stdout: { write: (text) => { stdout += text; } },
      stderr: { write: (text) => { stderr += text; } }
    }),
    (error) => {
      assert.match(error.message, /--brand is required/);
      assert.match(error.message, /acme/);
      return true;
    }
  );
});

test("command without --brand succeeds when only the default brand exists", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-cli-"));
  const brand = resolveBrand({ cwd });
  await initBrandWorkspace(brand);

  let stdout = "";
  const result = await runCli(["draft", "--action", "pause-campaign", "--target", "urn:li:sponsoredCampaign:123", "--current", "ACTIVE", "--ad-account-urn", "urn:li:sponsoredAccount:999"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { stdout += text; } },
    stderr: { write: () => {} }
  });

  assert.equal(result.ok, true);
  assert.match(stdout, /^Brand: default \(from workspace\/brand\/\)/);
  assert.match(stdout, /Draft written:/);
});

test("brand:init --brand foo creates workspace/brands/foo and subsequent commands require --brand", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-cli-"));

  let stdout = "";
  const initResult = await runCli(["brand:init", "--brand", "foo"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { stdout += text; } },
    stderr: { write: () => {} }
  });

  assert.equal(initResult.ok, true);
  assert.equal(await pathExists(path.join(cwd, "workspace", "brands", "foo", "profile.md")), true);
  assert.match(stdout, /Brand: foo \(from workspace\/brands\/foo\//);

  await assert.rejects(
    () => runCli(["draft", "--action", "pause-campaign", "--target", "urn:li:sponsoredCampaign:123", "--current", "ACTIVE"], {
      cwd,
      env: { LINKEDIN_API_VERSION: "202604" },
      stdout: { write: () => {} },
      stderr: { write: () => {} }
    }),
    /--brand is required/
  );
});

test("demo command is exempt from brand-required guard when named brands exist", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-cli-"));
  await copyExamples(cwd);
  // Seed a named brand so the guard would normally fire.
  const other = resolveBrand({ cwd, brand: "acme" });
  await initBrandWorkspace(other);

  let stdout = "";
  const result = await runCli(["demo"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { stdout += text; } },
    stderr: { write: () => {} }
  });

  assert.equal(result.ok, true);
  assert.match(stdout, /Brand: exampleco \(from workspace\/brands\/exampleco\//);
});
