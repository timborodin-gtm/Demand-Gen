import test from "node:test";
import assert from "node:assert/strict";
import { fileStamp } from "../src/dates.js";

test("fileStamp preserves millisecond entropy for rapid drafts", () => {
  const first = fileStamp(new Date("2026-04-19T05:09:01.001Z"));
  const second = fileStamp(new Date("2026-04-19T05:09:01.999Z"));

  assert.notEqual(first, second);
  assert.equal(first, "2026-04-19T05-09-01-001Z");
});
