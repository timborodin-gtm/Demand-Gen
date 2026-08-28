import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { applyDraft, validateActions } from "../src/apply.js";
import { buildDraftMarkdown } from "../src/draft.js";
import { initBrandWorkspace, resolveBrand, saveSelectedAccount } from "../src/workspace.js";
import { pathExists, readTextIfExists, writeJson } from "../src/files.js";

test("apply dry-run validates current value without writing", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const brand = resolveBrand({ cwd, brand: "acme" });
  await initBrandWorkspace(brand);
  await saveSelectedAccount(brand, { urn: "urn:li:sponsoredAccount:999" });

  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, buildDraftMarkdown({
    brandContext: brand,
    title: "Pause",
    summary: "Pause one campaign.",
    actions: [{
      brand: "acme",
      adAccountUrn: "urn:li:sponsoredAccount:999",
      targetUrn: "urn:li:sponsoredCampaign:123",
      type: "pause_campaign",
      currentField: "status",
      currentValue: "ACTIVE",
      proposedValue: "PAUSED",
      reason: "Spend without buyer-quality signal.",
      riskLevel: "medium",
      rollbackNote: "Restore ACTIVE."
    }]
  }), "utf8");

  const client = {
    getCampaign: async () => ({ status: "ACTIVE" })
  };

  const result = await applyDraft({ brandContext: brand, draftPath, client, dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.preflight[0].observed, "ACTIVE");
});

test("apply refuses destructive actions", () => {
  assert.throws(() => validateActions([{
    brand: "default",
    adAccountUrn: "urn:li:sponsoredAccount:999",
    targetUrn: "urn:li:sponsoredCampaign:123",
    type: "delete_campaign",
    currentField: "status",
    currentValue: "ACTIVE",
    proposedValue: "DELETED",
    reason: "Nope",
    riskLevel: "high",
    rollbackNote: "Impossible"
  }]), /Refusing/);
});

test("live apply writes audit trail", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const brand = resolveBrand({ cwd });
  await initBrandWorkspace(brand);
  await saveSelectedAccount(brand, { urn: "urn:li:sponsoredAccount:999" });

  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, buildDraftMarkdown({
    brandContext: brand,
    title: "Budget",
    summary: "Budget change.",
    actions: [{
      brand: "default",
      adAccountUrn: "urn:li:sponsoredAccount:999",
      targetUrn: "urn:li:sponsoredCampaign:123",
      type: "set_daily_budget",
      currentField: "dailyBudget",
      currentValue: 100,
      proposedValue: 70,
      reason: "CPL is above average.",
      riskLevel: "low",
      rollbackNote: "Restore 100."
    }]
  }), "utf8");

  let patchFields;
  const client = {
    getCampaign: async () => ({ dailyBudget: { amount: "100", currencyCode: "USD" } }),
    patchCampaign: async (_account, _target, fields) => {
      patchFields = fields;
      return { ok: true };
    }
  };

  await applyDraft({ brandContext: brand, draftPath, client, dryRun: true });
  const result = await applyDraft({ brandContext: brand, draftPath, client, confirm: "APPLY" });
  assert.equal(result.results.length, 1);
  assert.equal(await pathExists(result.auditPath), true);
  assert.deepEqual(patchFields, { dailyBudget: { amount: "70", currencyCode: "USD" } });
});

test("apply refuses drafts for another brand account", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const brand = resolveBrand({ cwd, brand: "acme" });
  await initBrandWorkspace(brand);
  await saveSelectedAccount(brand, { urn: "urn:li:sponsoredAccount:111" });

  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, buildDraftMarkdown({
    brandContext: brand,
    title: "Pause",
    summary: "Pause.",
    actions: [{
      brand: "acme",
      adAccountUrn: "urn:li:sponsoredAccount:999",
      targetUrn: "urn:li:sponsoredCampaign:123",
      type: "pause_campaign",
      currentField: "status",
      currentValue: "ACTIVE",
      proposedValue: "PAUSED",
      reason: "Wrong account.",
      riskLevel: "medium",
      rollbackNote: "Restore ACTIVE."
    }]
  }), "utf8");

  const client = {
    getCampaign: async () => ({ status: "ACTIVE" })
  };

  await assert.rejects(
    () => applyDraft({ brandContext: brand, draftPath, client, dryRun: true }),
    /Draft account mismatch/
  );
});

test("apply does not treat editable stack.json as live-apply account authority", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const brand = resolveBrand({ cwd, brand: "acme" });
  await initBrandWorkspace(brand);
  await writeJson(brand.paths.stack, { linkedinAdAccountUrn: "urn:li:sponsoredAccount:999" });

  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, buildDraftMarkdown({
    brandContext: brand,
    title: "Pause",
    summary: "Pause.",
    actions: [{
      brand: "acme",
      adAccountUrn: "urn:li:sponsoredAccount:999",
      targetUrn: "urn:li:sponsoredCampaign:123",
      type: "pause_campaign",
      currentField: "status",
      currentValue: "ACTIVE",
      proposedValue: "PAUSED",
      reason: "Stack is not authority.",
      riskLevel: "medium",
      rollbackNote: "Restore ACTIVE."
    }]
  }), "utf8");

  await assert.rejects(
    () => applyDraft({
      brandContext: brand,
      draftPath,
      client: { getCampaign: async () => ({ status: "ACTIVE" }) },
      dryRun: true
    }),
    /No selected LinkedIn ad account/
  );
});

test("partial live apply failure still writes audit trail", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const brand = resolveBrand({ cwd });
  await initBrandWorkspace(brand);
  await saveSelectedAccount(brand, { urn: "urn:li:sponsoredAccount:999" });

  const draftPath = path.join(brand.paths.drafts, "draft.md");
  await writeFile(draftPath, buildDraftMarkdown({
    brandContext: brand,
    title: "Multi",
    summary: "Two actions.",
    actions: [
      {
        brand: "default",
        adAccountUrn: "urn:li:sponsoredAccount:999",
        targetUrn: "urn:li:sponsoredCampaign:123",
        type: "pause_campaign",
        currentField: "status",
        currentValue: "ACTIVE",
        proposedValue: "PAUSED",
        reason: "First action.",
        riskLevel: "medium",
        rollbackNote: "Restore ACTIVE."
      },
      {
        brand: "default",
        adAccountUrn: "urn:li:sponsoredAccount:999",
        targetUrn: "urn:li:sponsoredCreative:456",
        type: "pause_creative",
        currentField: "intendedStatus",
        currentValue: "ACTIVE",
        proposedValue: "PAUSED",
        reason: "Second action.",
        riskLevel: "low",
        rollbackNote: "Restore ACTIVE."
      }
    ]
  }), "utf8");

  const client = {
    getCampaign: async () => ({ status: "ACTIVE" }),
    getCreative: async () => ({ intendedStatus: "ACTIVE" }),
    patchCampaign: async () => ({ ok: true }),
    patchCreative: async () => {
      throw new Error("LinkedIn 500");
    }
  };

  await applyDraft({ brandContext: brand, draftPath, client, dryRun: true });

  let error;
  try {
    await applyDraft({ brandContext: brand, draftPath, client, confirm: "APPLY" });
  } catch (caught) {
    error = caught;
  }

  assert.match(error.message, /Audit written/);
  assert.equal(await pathExists(error.auditPath), true);
  const audit = await readTextIfExists(error.auditPath);
  assert.match(audit, /LinkedIn 500/);
  assert.match(audit, /"ok": true/);
});

test("apply refuses drafts outside the resolved brand drafts folder", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-"));
  const brand = resolveBrand({ cwd, brand: "acme" });
  await initBrandWorkspace(brand);
  await saveSelectedAccount(brand, { urn: "urn:li:sponsoredAccount:999" });

  const draftPath = path.join(cwd, "foreign-draft.md");
  await writeFile(draftPath, buildDraftMarkdown({
    brandContext: brand,
    title: "Foreign",
    summary: "Outside brand drafts folder.",
    actions: [{
      brand: "acme",
      adAccountUrn: "urn:li:sponsoredAccount:999",
      targetUrn: "urn:li:sponsoredCampaign:123",
      type: "pause_campaign",
      currentField: "status",
      currentValue: "ACTIVE",
      proposedValue: "PAUSED",
      reason: "Wrong location.",
      riskLevel: "medium",
      rollbackNote: "Restore ACTIVE."
    }]
  }), "utf8");

  await assert.rejects(
    () => applyDraft({
      brandContext: brand,
      draftPath,
      client: { getCampaign: async () => ({ status: "ACTIVE" }) },
      dryRun: true
    }),
    /Draft must live under workspace\/brands\/acme\/linkedin\/drafts/
  );
});
