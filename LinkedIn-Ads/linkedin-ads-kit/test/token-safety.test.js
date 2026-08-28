import { chmod, mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadToken, saveToken } from "../src/linkedin/auth.js";
import { initBrandWorkspace, resolveBrand } from "../src/workspace.js";

test("saveToken writes the OAuth token with mode 0600", { skip: isWindows() }, async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-token-"));
  const brand = resolveBrand({ cwd });
  await initBrandWorkspace(brand);

  await saveToken(brand, { access_token: "secret", expires_in: 3600 });

  const tokenStat = await stat(brand.paths.token);
  assert.equal(tokenStat.mode & 0o777, 0o600);

  const cacheStat = await stat(brand.paths.cache);
  const cacheMode = cacheStat.mode & 0o777;
  assert.equal(cacheMode & 0o077, 0, `cache dir mode 0${cacheMode.toString(8)} exposes bits to other users`);
});

test("loadToken warns to stderr when the token file is group- or world-readable", { skip: isWindows() }, async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-token-warn-"));
  const brand = resolveBrand({ cwd });
  await initBrandWorkspace(brand);
  await saveToken(brand, { access_token: "secret" });
  await chmod(brand.paths.token, 0o644);

  let captured = "";
  const stderr = { write: (text) => { captured += text; } };

  const token = await loadToken(brand, {}, { stderr });

  assert.ok(token, "token should still load when permissions are loose");
  assert.match(captured, /permissions 0644/);
  assert.match(captured, /chmod 600/);
});

function isWindows() {
  return process.platform === "win32";
}
