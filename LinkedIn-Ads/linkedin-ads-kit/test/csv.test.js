import { mkdtemp, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCsv,
  parseCsv,
  sanitizeCellForMarkdown,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  WARN_CSV_ROWS
} from "../src/csv.js";
import { runCli } from "../src/cli.js";
import { readTextIfExists } from "../src/files.js";

test("CSV constants are exported with expected defaults", () => {
  assert.equal(MAX_CSV_BYTES, 100 * 1024 * 1024);
  assert.equal(MAX_CSV_ROWS, 100_000);
  assert.equal(WARN_CSV_ROWS, 10_000);
});

test("loadCsv rejects files larger than the configured byte cap", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-csv-bytes-"));
  const filePath = path.join(cwd, "huge.csv");
  // 2 KB payload, cap at 1 KB to keep the test fast
  await writeFile(filePath, "name,value\n" + "a,b\n".repeat(500), "utf8");

  await assert.rejects(
    () => loadCsv(filePath, { maxBytes: 1024 }),
    (error) => {
      assert.match(error.message, /CSV refused/);
      assert.match(error.message, new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(error.message, /1024 byte limit/);
      return true;
    }
  );
});

test("loadCsv allows files at or below the byte cap", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-csv-bytes-ok-"));
  const filePath = path.join(cwd, "small.csv");
  await writeFile(filePath, "name,value\nada,1\n", "utf8");

  const rows = await loadCsv(filePath, { maxBytes: 1024 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "ada");
});

test("parseCsv rejects datasets above the row cap", () => {
  const header = "name,value\n";
  const lines = Array.from({ length: 5 }, (_, index) => `n${index},${index}`).join("\n");
  assert.throws(
    () => parseCsv(`${header}${lines}\n`, { maxRows: 3, sourcePath: "rows.csv", stderr: { write: () => {} } }),
    /CSV refused: rows\.csv contains 5 rows which exceeds the 3 row limit/
  );
});

test("parseCsv warns (does not throw) above the warn threshold", () => {
  const header = "name,value\n";
  const lines = Array.from({ length: 5 }, (_, index) => `n${index},${index}`).join("\n");
  let warning = "";
  const rows = parseCsv(`${header}${lines}\n`, {
    maxRows: 100,
    warnRows: 3,
    sourcePath: "warn.csv",
    stderr: { write: (text) => { warning += text; } }
  });
  assert.equal(rows.length, 5);
  assert.match(warning, /WARN: warn\.csv has 5 rows/);
});

test("parseCsv disambiguates duplicate normalized headers and warns", () => {
  let warning = "";
  const rows = parseCsv(
    "Work Email,work-email\nada@example.com,ada@evil.example.com\n",
    { sourcePath: "dup.csv", stderr: { write: (text) => { warning += text; } } }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].work_email, "ada@example.com");
  assert.equal(rows[0].work_email__2, "ada@evil.example.com");
  assert.match(warning, /WARN: duplicate CSV header in dup\.csv/);
  assert.match(warning, /"Work Email"/);
  assert.match(warning, /"work-email"/);
  assert.match(warning, /work_email__2/);
});

test("sanitizeCellForMarkdown defuses formula-injection prefixes", () => {
  assert.equal(sanitizeCellForMarkdown("=HYPERLINK(\"http://evil\")"), "'=HYPERLINK(\"http://evil\")");
  assert.equal(sanitizeCellForMarkdown("+CMD"), "'+CMD");
  assert.equal(sanitizeCellForMarkdown("-1"), "'-1");
  assert.equal(sanitizeCellForMarkdown("@SUM"), "'@SUM");
  assert.equal(sanitizeCellForMarkdown("\tinjected"), "'\tinjected");
  assert.equal(sanitizeCellForMarkdown("\rinjected"), "'\rinjected");
});

test("sanitizeCellForMarkdown is a no-op for safe values", () => {
  assert.equal(sanitizeCellForMarkdown("Pipeline CFO"), "Pipeline CFO");
  assert.equal(sanitizeCellForMarkdown(""), "");
  assert.equal(sanitizeCellForMarkdown(null), "");
  assert.equal(sanitizeCellForMarkdown(undefined), "");
  assert.equal(sanitizeCellForMarkdown(42), "42");
});

test("daily brief defuses formula injection in CSV-derived campaign names", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "linkedin-kit-csv-defuse-"));
  await writeFile(
    path.join(cwd, "campaigns.csv"),
    [
      "Campaign Name,Campaign URN,Status,Daily Budget,Impressions,Clicks,Spend,Leads",
      "\"=HYPERLINK(\"\"http://evil.example.com\"\",\"\"click\"\")\",urn:li:sponsoredCampaign:9001,ACTIVE,200,50000,80,2400,0"
    ].join("\n"),
    "utf8"
  );

  let stdout = "";
  await runCli(["daily:brief", "--account", "999", "--campaigns", "campaigns.csv"], {
    cwd,
    env: { LINKEDIN_API_VERSION: "202604" },
    stdout: { write: (text) => { stdout += text; } },
    stderr: { write: () => {} }
  });

  assert.match(stdout, /Daily brief written/);

  const briefDir = path.join(cwd, "workspace/brand/linkedin/briefs");
  const files = (await readdir(briefDir)).filter((file) => file.endsWith("-daily-brief.md"));
  assert.ok(files.length > 0);
  const brief = await readTextIfExists(path.join(briefDir, files.at(-1)));

  // Confirm the dangerous prefix is neutralized everywhere the campaign name appears.
  assert.match(brief, /'=HYPERLINK/);
  assert.doesNotMatch(brief, /^=HYPERLINK/m);
});
