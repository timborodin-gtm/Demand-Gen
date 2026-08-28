import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { initBrandWorkspace, loadBrandMemory, resolveBrand } from "../src/workspace.js";
import { pathExists } from "../src/files.js";

test("brand:init creates default workspace without overwriting", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const brand = resolveBrand({ cwd });

  const first = await initBrandWorkspace(brand);
  const second = await initBrandWorkspace(brand);

  assert.ok(first.created.includes("workspace/brand/profile.md"));
  assert.ok(second.skipped.includes("workspace/brand/profile.md"));
  assert.equal(await pathExists(path.join(cwd, "workspace/brand/linkedin/briefs")), true);
});

test("brand resolver supports named brands", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const brand = resolveBrand({ cwd, brand: "Acme Inc!" });
  await initBrandWorkspace(brand);
  const memory = await loadBrandMemory(brand);

  assert.equal(brand.brand, "acme-inc");
  assert.match(brand.brandRoot, /workspace\/brands\/acme-inc$/);
  assert.match(memory.profile, /Brand Profile/);
});
