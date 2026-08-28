import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { applyDraft, DRY_RUN_REQUIRED_MESSAGE, DRY_RUN_STALE_MESSAGE, DRY_RUN_HASH_MISMATCH_MESSAGE, DRY_RUN_RECEIPT_INVALID_MESSAGE } from "../src/apply.js";
import { buildDraftMarkdown } from "../src/draft.js";
import { initBrandWorkspace, resolveBrand, saveSelectedAccount } from "../src/workspace.js";
import { pathExists, sha256File, writeJson } from "../src/files.js";

function makeDraftMarkdown(brand) {
  return buildDraftMarkdown({
    brandContext: brand,
    title: "Pause",
    summary: "Pause one campaign.",
    actions: [{
      brand: brand.brand,
      adAccountUrn: "urn:li:sponsoredAccount:999",
      targetUrn: "urn:li:sponsoredCampaign:123",
      type: "pause_campaign",
      currentField: "status",
      currentValue: "ACTIVE",
      proposedValue: "PAUSED",
      reason: "Test sidecar.",
      riskLevel: "medium",
      rollbackNote: "Restore ACTIVE."
    }]
  });
}

function makeClient() {
  return {
    getCampaign: async () => ({ status: "ACTIVE" }),
    patchCampaign: async () => ({ ok: true })
  };
}

async function setupBrand() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-sidecar-"));
  const brand = resolveBrand({ cwd });
  await initBrandWorkspace(brand);
  await saveSelectedAccount(brand, { urn: "urn:li:sponsoredAccount:999" });
  return { cwd, brand };
}

test("apply --confirm APPLY with no sidecar fails with clear message", async () => {
  const { cwd, brand } = await setupBrand();
  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, makeDraftMarkdown(brand), "utf8");

  await assert.rejects(
    () => applyDraft({
      brandContext: brand,
      draftPath,
      client: makeClient(),
      confirm: "APPLY"
    }),
    (error) => {
      assert.equal(error.message, DRY_RUN_REQUIRED_MESSAGE);
      return true;
    }
  );

  assert.equal(await pathExists(`${draftPath}.dry-run.json`), false);
});

test("apply --confirm APPLY with stale (>24h) sidecar fails", async () => {
  const { cwd, brand } = await setupBrand();
  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, makeDraftMarkdown(brand), "utf8");

  const now = new Date();
  const staleDate = new Date(now.getTime() - (25 * 60 * 60 * 1000));
  await applyDraft({
    brandContext: brand,
    draftPath,
    client: makeClient(),
    dryRun: true,
    date: staleDate
  });

  await assert.rejects(
    () => applyDraft({
      brandContext: brand,
      draftPath,
      client: makeClient(),
      confirm: "APPLY",
      date: now
    }),
    (error) => {
      assert.equal(error.message, DRY_RUN_STALE_MESSAGE);
      return true;
    }
  );
});

test("apply --confirm APPLY after a matching dry-run proceeds", async () => {
  const { cwd, brand } = await setupBrand();
  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, makeDraftMarkdown(brand), "utf8");

  const client = makeClient();

  await applyDraft({
    brandContext: brand,
    draftPath,
    client,
    dryRun: true
  });

  const applyResult = await applyDraft({
    brandContext: brand,
    draftPath,
    client,
    confirm: "APPLY"
  });

  assert.equal(applyResult.dryRun, false);
  assert.equal(applyResult.results.length, 1);
  assert.equal(applyResult.results[0].ok, true);
  assert.equal(await pathExists(applyResult.auditPath), true);
});

test("apply --confirm APPLY fails when draft hash changes after dry-run", async () => {
  const { cwd, brand } = await setupBrand();
  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, makeDraftMarkdown(brand), "utf8");

  await applyDraft({
    brandContext: brand,
    draftPath,
    client: makeClient(),
    dryRun: true
  });

  // Append whitespace to change the hash while keeping draft valid.
  const original = await readFile(draftPath, "utf8");
  await writeFile(draftPath, `${original}\n`, "utf8");

  await assert.rejects(
    () => applyDraft({
      brandContext: brand,
      draftPath,
      client: makeClient(),
      confirm: "APPLY"
    }),
    (error) => {
      assert.equal(error.message, DRY_RUN_HASH_MISMATCH_MESSAGE);
      return true;
    }
  );
});

test("apply --confirm APPLY --skip-dry-run-check proceeds with stderr warning", async () => {
  const { cwd, brand } = await setupBrand();
  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, makeDraftMarkdown(brand), "utf8");

  let stderrText = "";
  const client = makeClient();
  const result = await applyDraft({
    brandContext: brand,
    draftPath,
    client,
    confirm: "APPLY",
    skipDryRunCheck: true,
    stderr: { write: (text) => { stderrText += text; } }
  });

  assert.equal(result.dryRun, false);
  assert.equal(result.results[0].ok, true);
  assert.match(stderrText, /WARNING: --skip-dry-run-check bypassed/);
});

test("apply --confirm APPLY rejects a hand-forged sidecar without a valid dry-run signature", async () => {
  const { brand } = await setupBrand();
  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, makeDraftMarkdown(brand), "utf8");
  await writeJson(`${draftPath}.dry-run.json`, {
    version: 1,
    brand: brand.brand,
    brandMode: brand.mode,
    draftPath: path.relative(brand.cwd, draftPath),
    draftHash: await sha256File(draftPath),
    timestamp: new Date().toISOString(),
    observedValues: {},
    signature: "not-a-valid-signature"
  });

  await assert.rejects(
    () => applyDraft({
      brandContext: brand,
      draftPath,
      client: makeClient(),
      confirm: "APPLY"
    }),
    (error) => {
      assert.equal(error.message, DRY_RUN_RECEIPT_INVALID_MESSAGE);
      return true;
    }
  );
});
