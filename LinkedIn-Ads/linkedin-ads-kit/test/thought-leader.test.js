import test from "node:test";
import assert from "node:assert/strict";
import { buildDraft } from "../src/draft.js";
import {
  buildThoughtLeaderFallbackPacket,
  buildThoughtLeaderLaunchPacket,
  buildThoughtLeaderScorecard,
  parsePostFile,
  renderThoughtLeaderScorecard,
  scoreThoughtLeaderPost
} from "../src/thoughtLeaderAds.js";

test("scores thought leader posts deterministically", () => {
  const brandMemory = {
    brand: "acme",
    audience: "CFO VP Marketing revenue operations pipeline quality",
    offer: "Pipeline Quality Audit for paid social teams"
  };

  const score = scoreThoughtLeaderPost({
    text: "We tested this with 42 pipeline reviews. Cheap leads were the problem, but buyer quality was the real fix for revenue.",
    reactions: 80,
    comments: 12,
    shares: 5
  }, brandMemory);

  assert.equal(score.total, scoreThoughtLeaderPost({
    text: "We tested this with 42 pipeline reviews. Cheap leads were the problem, but buyer quality was the real fix for revenue.",
    reactions: 80,
    comments: 12,
    shares: 5
  }, brandMemory).total);
  assert.ok(score.total >= 55);
});

test("fallback packet includes Campaign Manager launch details", () => {
  const packet = buildThoughtLeaderFallbackPacket({
    post: { url: "https://www.linkedin.com/feed/update/test" },
    score: { total: 82, recommendation: "strong_candidate" },
    brandMemory: { brand: "acme" },
    campaign: { budget: "$100/day" }
  });

  assert.match(packet, /Campaign Manager Fallback Packet/);
  assert.match(packet, /Approval Request Copy/);
  assert.match(packet, /utm_source=linkedin/);
});

test("manual review posts do not create API actions", () => {
  const draft = buildDraft({
    brandContext: { brand: "acme" },
    brandMemory: {
      brand: "acme",
      audience: "CFO VP Marketing revenue operations pipeline quality",
      offer: "Pipeline Quality Audit"
    },
    args: {
      action: "thought-leader-ad",
      post: "https://www.linkedin.com/feed/update/test",
      post_text: "Big news. We launched a new feature. Learn more.",
      reactions: 3,
      comments: 0,
      shares: 0,
      ad_account_urn: "urn:li:sponsoredAccount:999",
      post_urn: "urn:li:ugcPost:123",
      campaign: "urn:li:sponsoredCampaign:456"
    }
  });

  assert.equal(draft.actions.length, 0);
  assert.match(draft.summary, /No API creative action/);
  assert.match(draft.fallbackPacket, /Do not sponsor this post yet/);
  assert.match(draft.fallbackPacket, /No paid budget yet/);
});

test("parsePostFile extracts frontmatter metadata and body text", () => {
  const content = `---
author: Test Author
role: Founder
url: https://example.test/post
urn: urn:li:ugcPost:12345
reactions: 150
comments: 20
shares: 5
---

This is the body of the post with CFO pipeline pain and proof from 42 reviews.
`;
  const post = parsePostFile({ content, filename: "test-post.md" });
  assert.equal(post.author, "Test Author");
  assert.equal(post.role, "Founder");
  assert.equal(post.url, "https://example.test/post");
  assert.equal(post.urn, "urn:li:ugcPost:12345");
  assert.equal(post.reactions, 150);
  assert.equal(post.comments, 20);
  assert.equal(post.shares, 5);
  assert.match(post.text, /42 reviews/);
  assert.match(post.excerpt, /CFO pipeline pain/);
});

test("parsePostFile tolerates posts without frontmatter", () => {
  const post = parsePostFile({ content: "Just a body.\n", filename: "no-meta.md" });
  assert.equal(post.author, "no-meta");
  assert.equal(post.reactions, 0);
  assert.equal(post.text, "Just a body.");
});

test("buildThoughtLeaderScorecard ranks strong candidates above generic posts", () => {
  const brandMemory = {
    brand: "acme",
    audience: "CFO VP Marketing revenue operations pipeline quality",
    offer: "Pipeline Quality Audit for paid social teams"
  };

  const strong = parsePostFile({
    content: `---
author: Strong Author
role: Founder
reactions: 400
comments: 60
shares: 30
---

Our CFO broke the pipeline review meeting by asking which campaigns produced revenue. After a 42-review audit, we learned cheap leads had the worst close rate and buyer quality mattered more than cost per lead. Proof beats budget.
`,
    filename: "strong.md"
  });

  const weak = parsePostFile({
    content: `---
author: Weak Author
reactions: 14
comments: 1
shares: 0
---

Big news. We are so excited to announce our nomination. #grateful #leadership
`,
    filename: "weak.md"
  });

  const { ranked, top, tiers, headline } = buildThoughtLeaderScorecard({
    posts: [weak, strong],
    brandMemory
  });

  assert.equal(ranked.length, 2);
  assert.equal(top.post.author, "Strong Author", "strong post should rank first");
  assert.ok(top.score.total >= 75, `top score should clear the strong-candidate gate, got ${top.score.total}`);
  assert.equal(tiers.manual_review.length >= 1, true, "weak post should fall into manual_review");
  assert.match(headline, /Headline:/);
  assert.match(headline, /Strong Author/);
});

test("renderThoughtLeaderScorecard emits sections, rankings, and an operator note", () => {
  const brandMemory = {
    brand: "acme",
    audience: "CFO VP Marketing revenue pipeline quality",
    offer: "Pipeline Quality Audit"
  };

  const postA = parsePostFile({
    content: `---
author: A
reactions: 200
comments: 40
shares: 10
---

CFO pipeline pain and proof from 42 reviews.
`,
    filename: "a.md"
  });

  const scorecard = buildThoughtLeaderScorecard({ posts: [postA], brandMemory });
  const markdown = renderThoughtLeaderScorecard({ scorecard, brandMemory });
  assert.match(markdown, /Thought Leader Ads Scorecard/);
  assert.match(markdown, /How This Is Scored/);
  assert.match(markdown, /Ranked Candidates/);
  assert.match(markdown, /Operator Note/);
  assert.match(markdown, /a\.md/);
});

test("buildThoughtLeaderLaunchPacket produces launch-ready packet for strong candidates", () => {
  const packet = buildThoughtLeaderLaunchPacket({
    post: {
      author: "Jane Founder",
      role: "Founder",
      url: "https://example.test/post",
      urn: "urn:li:ugcPost:9999",
      reactions: 250,
      comments: 40,
      shares: 12,
      excerpt: "CFO pipeline pain proof."
    },
    score: { total: 88, recommendation: "strong_candidate" },
    brandMemory: {
      brand: "acme",
      audience: "B2B SaaS companies spending over 25k per month across paid social."
    },
    campaign: { budget: "$120/day" }
  });

  assert.match(packet, /Thought Leader Ads Launch Packet/);
  assert.match(packet, /Sponsor this post/);
  assert.match(packet, /urn:li:ugcPost:9999/);
  assert.match(packet, /\$120\/day/);
  assert.match(packet, /Pre-Launch Checklist/);
  assert.match(packet, /Kill Criteria/);
  assert.match(packet, /utm_content=jane_founder/);
  assert.match(packet, /Hi Jane Founder/);
});

test("buildThoughtLeaderLaunchPacket warns when the post is not launch ready", () => {
  const packet = buildThoughtLeaderLaunchPacket({
    post: { author: "Someone", url: "https://example.test/hold", urn: "urn:li:ugcPost:1" },
    score: { total: 40, recommendation: "manual_review" },
    brandMemory: { brand: "acme" }
  });

  assert.match(packet, /Do not sponsor this post yet/);
  assert.match(packet, /No paid budget yet/);
  assert.match(packet, /Hold approval request/);
});
