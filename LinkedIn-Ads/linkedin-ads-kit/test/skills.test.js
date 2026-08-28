import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const SKILLS_DIR = new URL("../skills/", import.meta.url);
const ANALYSIS_SKILLS = new Set([
  "buyer-quality-audit",
  "form-friction-review",
  "lead-quality-mapper",
  "linkedin-ads",
  "offer-angle-diagnoser",
  "pipeline-brief-writer",
  "sales-handoff",
  "thought-leader-ad-selector"
]);
const LINKEDIN_REFERENCE_FILES = [
  "api-data-map.md",
  "brief-template.md",
  "buyer-quality-rubric.md",
  "export-formats.md",
  "lead-form-playbook.md",
  "operator-thesis.md",
  "safe-apply-model.md",
  "thought-leader-rubric.md"
];

test("repo skills have valid frontmatter", async () => {
  const skills = await loadSkills();

  assert.equal(skills.length, 10);

  for (const skill of skills) {
    assert.equal(skill.frontmatter.name, skill.directory);
    assert.ok(skill.frontmatter.description, `${skill.directory} is missing a description`);
  }
});

test("analysis skills load brand context and produce operator recommendations", async () => {
  const skills = await loadSkills();

  for (const skill of skills.filter((item) => ANALYSIS_SKILLS.has(item.directory))) {
    assert.match(skill.body, /brand context/i, `${skill.directory} should load brand context first`);
    assert.match(skill.body, /why this matters/i, `${skill.directory} should explain why this matters`);
    assert.match(skill.body, /what to do next/i, `${skill.directory} should explain what to do next`);
  }
});

test("Thought Leader and apply skills enforce the score gate", async () => {
  const skills = await loadSkills();
  const thoughtLeader = skills.find((skill) => skill.directory === "thought-leader-ad-selector");
  const apply = skills.find((skill) => skill.directory === "linkedin-ads-apply");

  assert.match(thoughtLeader.body, /manual_review/);
  assert.match(thoughtLeader.body, /API draft only when the score gate/i);
  assert.match(apply.body, /manual_review/);
  assert.match(apply.body, /score gate/i);
});

test("main LinkedIn Ads skill exposes a reference-backed operator protocol", async () => {
  const skills = await loadSkills();
  const main = skills.find((skill) => skill.directory === "linkedin-ads");

  assert.ok(main.body.split(/\r?\n/).length >= 150);
  for (const fileName of LINKEDIN_REFERENCE_FILES) {
    assert.match(main.body, new RegExp(`references/${escapeRegExp(fileName)}`));
    const reference = await readFile(new URL(`linkedin-ads/references/${fileName}`, SKILLS_DIR), "utf8");
    assert.ok(reference.length > 500, `${fileName} should contain substantive guidance`);
  }
});

test("specialist skills point to shared LinkedIn Ads references", async () => {
  const skills = await loadSkills();

  for (const skill of skills.filter((item) => item.directory !== "linkedin-ads")) {
    assert.match(skill.body, /\.\.\/linkedin-ads\/references\//, `${skill.directory} should link to shared references`);
  }
});

async function loadSkills() {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return Promise.all(directories.map(async (directory) => {
    const filePath = new URL(`${directory}/SKILL.md`, SKILLS_DIR);
    const text = await readFile(filePath, "utf8");
    return {
      directory,
      text,
      body: text.replace(/^---\n[\s\S]*?\n---\n?/, ""),
      frontmatter: parseFrontmatter(text, path.join("skills", directory, "SKILL.md"))
    };
  }));
}

function parseFrontmatter(text, label) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  assert.ok(match, `${label} is missing frontmatter`);

  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    frontmatter[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  return frontmatter;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
