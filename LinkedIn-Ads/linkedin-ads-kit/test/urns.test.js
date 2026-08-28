import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSponsoredAccountUrn,
  normalizeCampaignUrn,
  accountId,
  accountUrn,
  isSponsoredAccountUrn,
  isCampaignUrn
} from "../src/urns.js";

// normalizeSponsoredAccountUrn

test("normalizeSponsoredAccountUrn: already a full URN is returned unchanged", () => {
  const urn = "urn:li:sponsoredAccount:123456";
  assert.equal(normalizeSponsoredAccountUrn(urn), urn);
});

test("normalizeSponsoredAccountUrn: bare numeric id is prefixed", () => {
  assert.equal(normalizeSponsoredAccountUrn("789"), "urn:li:sponsoredAccount:789");
});

test("normalizeSponsoredAccountUrn: numeric number id is prefixed", () => {
  assert.equal(normalizeSponsoredAccountUrn(42), "urn:li:sponsoredAccount:42");
});

test("normalizeSponsoredAccountUrn: empty string returns empty string", () => {
  assert.equal(normalizeSponsoredAccountUrn(""), "");
});

test("normalizeSponsoredAccountUrn: null/undefined returns empty string", () => {
  assert.equal(normalizeSponsoredAccountUrn(null), "");
  assert.equal(normalizeSponsoredAccountUrn(undefined), "");
});

test("normalizeSponsoredAccountUrn: non-numeric garbage string is returned as-is", () => {
  assert.equal(normalizeSponsoredAccountUrn("garbage-value"), "garbage-value");
});

test("normalizeSponsoredAccountUrn: trims leading/trailing whitespace before testing", () => {
  assert.equal(normalizeSponsoredAccountUrn("  999  "), "urn:li:sponsoredAccount:999");
});

// normalizeCampaignUrn

test("normalizeCampaignUrn: already a full URN is returned unchanged", () => {
  const urn = "urn:li:sponsoredCampaign:55555";
  assert.equal(normalizeCampaignUrn(urn), urn);
});

test("normalizeCampaignUrn: bare numeric id is prefixed", () => {
  assert.equal(normalizeCampaignUrn("9001"), "urn:li:sponsoredCampaign:9001");
});

test("normalizeCampaignUrn: numeric number is prefixed", () => {
  assert.equal(normalizeCampaignUrn(7), "urn:li:sponsoredCampaign:7");
});

test("normalizeCampaignUrn: empty string returns empty string", () => {
  assert.equal(normalizeCampaignUrn(""), "");
});

test("normalizeCampaignUrn: null returns empty string", () => {
  assert.equal(normalizeCampaignUrn(null), "");
});

test("normalizeCampaignUrn: non-numeric garbage string is returned as-is", () => {
  assert.equal(normalizeCampaignUrn("not-a-urn"), "not-a-urn");
});

// accountId

test("accountId: extracts numeric id from a full URN", () => {
  assert.equal(accountId("urn:li:sponsoredAccount:111"), "111");
});

test("accountId: bare id is returned as-is", () => {
  assert.equal(accountId("222"), "222");
});

test("accountId: empty string returns empty string", () => {
  assert.equal(accountId(""), "");
});

// accountUrn

test("accountUrn: already a full URN is returned unchanged", () => {
  const urn = "urn:li:sponsoredAccount:333";
  assert.equal(accountUrn(urn), urn);
});

test("accountUrn: bare id is prefixed", () => {
  assert.equal(accountUrn("444"), "urn:li:sponsoredAccount:444");
});

test("accountUrn: empty string produces degenerate URN (mirrors client.js behavior)", () => {
  assert.equal(accountUrn(""), "urn:li:sponsoredAccount:");
});

// predicates

test("isSponsoredAccountUrn: returns true for valid URN", () => {
  assert.ok(isSponsoredAccountUrn("urn:li:sponsoredAccount:1"));
});

test("isSponsoredAccountUrn: returns false for bare id", () => {
  assert.equal(isSponsoredAccountUrn("12345"), false);
});

test("isSponsoredAccountUrn: returns false for empty string", () => {
  assert.equal(isSponsoredAccountUrn(""), false);
});

test("isCampaignUrn: returns true for valid URN", () => {
  assert.ok(isCampaignUrn("urn:li:sponsoredCampaign:99"));
});

test("isCampaignUrn: returns false for bare id", () => {
  assert.equal(isCampaignUrn("99"), false);
});

test("isCampaignUrn: returns false for sponsoredAccount URN", () => {
  assert.equal(isCampaignUrn("urn:li:sponsoredAccount:99"), false);
});
