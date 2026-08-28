import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadToken, saveToken } from "../src/linkedin/auth.js";
import { initBrandWorkspace, resolveBrand } from "../src/workspace.js";

async function seedToken(brandBrand, expiresAt) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-auth-"));
  const brand = resolveBrand({ cwd, brand: brandBrand });
  await initBrandWorkspace(brand);
  await saveToken(brand, {
    access_token: "fake-token-value",
    token_type: "Bearer",
    apiVersion: "202604",
    expiresAt
  });
  return { cwd, brand };
}

test("loadToken with expired expiresAt returns token and writes EXPIRED warning to stderr", async () => {
  const expiredAt = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
  const { brand } = await seedToken(undefined, expiredAt);

  let stderrText = "";
  const token = await loadToken(brand, {}, { stderr: { write: (text) => { stderrText += text; } } });

  assert.ok(token, "token should still be returned even if expired");
  assert.equal(token.access_token, "fake-token-value");
  assert.equal(token.expiryStatus, "expired");
  assert.match(stderrText, /EXPIRED/);
  assert.match(stderrText, /Re-authenticate/);
  assert.match(stderrText, /npm run auth/);
});

test("loadToken with expiresAt 2h from now returns token + expiring-soon warning", async () => {
  const soon = new Date(Date.now() + (2 * 60 * 60 * 1000)).toISOString();
  const { brand } = await seedToken("acme", soon);

  let stderrText = "";
  const token = await loadToken(brand, {}, { stderr: { write: (text) => { stderrText += text; } } });

  assert.ok(token);
  assert.equal(token.expiryStatus, "expiring_soon");
  assert.match(stderrText, /expires in/);
  assert.match(stderrText, /npm run auth -- --brand acme/);
  assert.doesNotMatch(stderrText, /EXPIRED/);
});

test("loadToken with expiresAt 30 days out returns token silently", async () => {
  const future = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
  const { brand } = await seedToken(undefined, future);

  let stderrText = "";
  const token = await loadToken(brand, {}, { stderr: { write: (text) => { stderrText += text; } } });

  assert.ok(token);
  assert.equal(token.expiryStatus, "fresh");
  assert.equal(stderrText, "");
});
