import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/csv.js";
import { normalizeLeadRow, summarizeLeadRows } from "../src/leads.js";

test("lead mapper recognizes common LinkedIn and CRM aliases", () => {
  const row = normalizeLeadRow({
    first_name: "Ada",
    last_name: "Lovelace",
    email_address: "ada@example.com",
    job_title: "VP Marketing",
    company_name: "Analytical Engines",
    ad_id: "urn:li:sponsoredCreative:456",
    ad_set_id: "789",
    test_lead: "FALSE",
    crm_stage: "Sales Accepted",
    utm_source: "linkedin",
    buying_committee_role: "budget owner"
  });

  assert.equal(row.fields.firstName, "Ada");
  assert.equal(row.fields.email, "ada@example.com");
  assert.equal(row.fields.jobTitle, "VP Marketing");
  assert.equal(row.fields.adId, "urn:li:sponsoredCreative:456");
  assert.equal(row.fields.adSetId, "789");
  assert.equal(row.quality, "qualified");
  assert.deepEqual(row.customFields, {
    utm_source: "linkedin",
    buying_committee_role: "budget owner"
  });
});

test("lead summary preserves custom fields and counts coverage", () => {
  const summary = summarizeLeadRows([
    {
      "First Name": "Ada",
      "Email Address": "ada@example.com",
      Campaign: "Pipeline Quality",
      "Test Lead": "FALSE",
      Status: "Opportunity",
      "UTM Source": "linkedin"
    },
    {
      "First Name": "Grace",
      "Work Email Address": "grace@example.com",
      "Company Name": "Compiler Co",
      Campaign: "Pipeline Quality",
      Status: "Disqualified",
      "Bad Fit Reason": "student"
    },
    {
      "Lead ID": "L-003",
      "Job Title": "CFO",
      "Campaign ID": "urn:li:sponsoredCampaign:123",
      "Test Lead": "TRUE"
    }
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.qualified, 1);
  assert.equal(summary.disqualified, 1);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.testLeads, 1);
  assert.equal(summary.campaigns[0].value, "Pipeline Quality");
  assert.ok(summary.customFields.some((field) => field.key === "utm_source"));
  assert.ok(summary.customFields.some((field) => field.key === "bad_fit_reason"));
  assert.equal(summary.fieldCoverage.find((field) => field.field === "email").count, 1);
  assert.equal(summary.fieldCoverage.find((field) => field.field === "workEmail").count, 1);
});

test("CSV parser can find lead export headers after metadata rows", () => {
  const rows = parseCsv([
    "Lead report",
    "Generated At,2026-04-19",
    "",
    "First Name,Last Name,Email Address,Test Lead,UTM Source",
    "Ada,Lovelace,ada@example.com,FALSE,linkedin"
  ].join("\n"));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].first_name, "Ada");
  assert.equal(rows[0].email_address, "ada@example.com");
  assert.equal(rows[0].test_lead, "FALSE");
  assert.equal(rows[0].utm_source, "linkedin");
});
