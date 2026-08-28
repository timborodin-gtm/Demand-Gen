import test from "node:test";
import assert from "node:assert/strict";
import { LinkedInClient, LinkedInApiError, accountId, accountUrn } from "../src/linkedin/client.js";

test("LinkedIn client sends required version and Rest.li headers", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: url.toString(), options });
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => JSON.stringify({ elements: [] })
    };
  };

  const client = new LinkedInClient({
    accessToken: "token",
    apiVersion: "202604",
    fetchImpl
  });
  await client.getAdAccounts();

  assert.equal(calls[0].options.headers["Linkedin-Version"], "202604");
  assert.equal(calls[0].options.headers["X-Restli-Protocol-Version"], "2.0.0");
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");
  assert.match(calls[0].url, /\/rest\/adAccounts/);
});

test("account helpers normalize ids and URNs", () => {
  assert.equal(accountId("urn:li:sponsoredAccount:123"), "123");
  assert.equal(accountId("456"), "456");
  assert.equal(accountUrn("123"), "urn:li:sponsoredAccount:123");
  assert.equal(accountUrn("urn:li:sponsoredAccount:123"), "urn:li:sponsoredAccount:123");
});

test("request aborts on timeout and throws typed LinkedInApiError", async () => {
  // fetchImpl that never resolves unless aborted via signal.
  const fetchImpl = (url, options) =>
    new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });

  const client = new LinkedInClient({
    accessToken: "token",
    apiVersion: "202604",
    fetchImpl,
    timeoutMs: 50
  });

  const start = Date.now();
  await assert.rejects(
    () => client.getAdAccounts(),
    (error) => {
      assert.ok(error instanceof LinkedInApiError, "expected typed LinkedInApiError");
      assert.equal(error.status, undefined, "timeout errors have no HTTP status");
      assert.match(error.message, /timed out after 50ms/);
      assert.match(error.url, /\/rest\/adAccounts/);
      return true;
    }
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `timeout should fire quickly, elapsed=${elapsed}ms`);
});

test("getCreatives retries with q=search when primary fails with version-mismatch signature", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.toString());
    const urlStr = url.toString();
    if (urlStr.includes("q=criteria")) {
      return {
        ok: false,
        status: 400,
        headers: new Map(),
        text: async () =>
          JSON.stringify({
            message: "Unknown finder 'criteria' for this resource",
            status: 400
          })
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => JSON.stringify({ elements: [{ id: "c1" }] })
    };
  };

  const client = new LinkedInClient({
    accessToken: "token",
    apiVersion: "202604",
    fetchImpl
  });

  const result = await client.getCreatives("urn:li:sponsoredAccount:999");
  assert.deepEqual(result, { elements: [{ id: "c1" }] });
  assert.equal(calls.length, 2, "should attempt criteria then retry search");
  assert.match(calls[0], /q=criteria/);
  assert.match(calls[1], /q=search/);
});

test("getCreatives does NOT retry on a generic permission-denied 400", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.toString());
    return {
      ok: false,
      status: 400,
      headers: new Map(),
      text: async () =>
        JSON.stringify({
          message: "Not enough permissions to access this resource",
          serviceErrorCode: 100,
          status: 400
        })
    };
  };

  const client = new LinkedInClient({
    accessToken: "token",
    apiVersion: "202604",
    fetchImpl
  });

  await assert.rejects(
    () => client.getCreatives("urn:li:sponsoredAccount:999"),
    (error) => {
      assert.ok(error instanceof LinkedInApiError);
      assert.equal(error.status, 400);
      assert.match(error.body?.message || "", /permissions/i);
      return true;
    }
  );
  assert.equal(calls.length, 1, "permission-denied 400 must not trigger the fallback");
  assert.match(calls[0], /q=criteria/);
});

test("getCreatives does NOT retry on a 429 rate-limit response", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.toString());
    return {
      ok: false,
      status: 429,
      headers: new Map(),
      // Body happens to mention "finder" and "unknown" — but status is 429,
      // not 400/404, so the retry must not trigger.
      text: async () =>
        JSON.stringify({
          message: "Rate limit hit; unknown finder retry is not allowed",
          status: 429
        })
    };
  };

  const client = new LinkedInClient({
    accessToken: "token",
    apiVersion: "202604",
    fetchImpl
  });

  await assert.rejects(
    () => client.getCreatives("urn:li:sponsoredAccount:999"),
    (error) => {
      assert.ok(error instanceof LinkedInApiError);
      assert.equal(error.status, 429);
      return true;
    }
  );
  assert.equal(calls.length, 1, "429 must not trigger the creative-shape retry");
});
